var Web3 = require('web3');
var web3 = new Web3(new Web3.providers.HttpProvider("http://localhost:8545"));

var shell = require('shelljs');
var SolidityCoder = require("web3/lib/solidity/coder.js");
var coverage = {};
var fs = require('fs');
var path = require('path');
var getInstrumentedVersion = require('./instrumentSolidity.js');
var mkdirp = require('mkdirp');

var childprocess = require('child_process');

//PAtch our local testrpc if necessary
if (!shell.test('-e','./node_modules/ethereumjs-vm/lib/opFns.js.orig')){
    console.log('patch local testrpc...')
    shell.exec('patch -b ./node_modules/ethereumjs-vm/lib/opFns.js ./hookIntoEvents.patch')
}
//Run the modified testrpc with large block limit
var testrpcProcess = childprocess.exec('./node_modules/ethereumjs-testrpc/bin/testrpc --gasLimit 0xfffffffffff')

if (shell.test('-d','../originalContracts')){
    console.log("There is already an 'originalContracts' directory in your truffle directory.\nThis is probably due to a previous solcover failure.\nPlease make sure the ./contracts/ directory contains your contracts (perhaps by copying them from originalContracts), and then delete the originalContracts directory.")
    process.exit(1);
}

shell.mv('./../contracts/', './../originalContracts/');
shell.mkdir('./../contracts/');
//For each contract in originalContracts, get the instrumented version
shell.ls('./../originalContracts/**/*.sol').forEach(function(file) {
    if (file !== 'originalContracts/Migrations.sol') {
        console.log("instrumenting ", file);
        var contract = fs.readFileSync("./" + file).toString();
        var fileName = path.basename(file);
        var instrumentedContractInfo = getInstrumentedVersion(contract, file, true);
        mkdirp.sync(path.dirname(file.replace('originalContracts', 'contracts')));
        fs.writeFileSync(file.replace('originalContracts','contracts'), instrumentedContractInfo.contract);
        var canonicalContractPath = path.resolve(file);
        coverage[canonicalContractPath] = { "l": {}, "path": canonicalContractPath, "s": {}, "b": {}, "f": {}, "fnMap": {}, "statementMap": {}, "branchMap": {} };
        for (idx in instrumentedContractInfo.runnableLines) {
            coverage[canonicalContractPath]["l"][instrumentedContractInfo.runnableLines[idx]] = 0;
        }
        coverage[canonicalContractPath].fnMap = instrumentedContractInfo.fnMap;
        for (x=1; x<=Object.keys(instrumentedContractInfo.fnMap).length; x++ ){
            coverage[canonicalContractPath]["f"][x] = 0;
        }
        coverage[canonicalContractPath].branchMap = instrumentedContractInfo.branchMap;
        for (x=1; x<=Object.keys(instrumentedContractInfo.branchMap).length; x++ ){
            coverage[canonicalContractPath]["b"][x] = [0,0];
        }
        coverage[canonicalContractPath].statementMap= instrumentedContractInfo.statementMap;
        for (x=1; x<=Object.keys(instrumentedContractInfo.statementMap).length; x++ ){
            coverage[canonicalContractPath]["s"][x] = 0;
        }
    }
});
shell.cp("./../originalContracts/Migrations.sol", "./../contracts/Migrations.sol");

shell.rm('./allFiredEvents'); //Delete previous results
shell.exec('truffle test --network coverage');

events = fs.readFileSync('./allFiredEvents').toString().split('\n')
for (idx=0; idx < events.length-1; idx++){
    //The limit here isn't a bug - there is an empty line at the end of this file, so we don't
    //want to go to the very end of the array.
    var event = JSON.parse(events[idx]);
    if (event.topics.indexOf("b8995a65f405d9756b41a334f38d8ff0c93c4934e170d3c1429c3e7ca101014d") >= 0) {
        var data = SolidityCoder.decodeParams(["string", "uint256"], event.data.replace("0x", ""));
        var canonicalContractPath = path.resolve(data[0]);
        coverage[canonicalContractPath]["l"][data[1].toNumber()] += 1;
    }else if(event.topics.indexOf("d4ce765fd23c5cc3660249353d61ecd18ca60549dd62cb9ca350a4244de7b87f")>=0){
        var data = SolidityCoder.decodeParams(["string", "uint256"], event.data.replace("0x", ""));
        var canonicalContractPath = path.resolve(data[0]);
        coverage[canonicalContractPath]["f"][data[1].toNumber()] += 1;
    }else if(event.topics.indexOf("d4cf56ed5ba572684f02f889f12ac42d9583c8e3097802060e949bfbb3c1bff5")>=0){
        var data = SolidityCoder.decodeParams(["string", "uint256", "uint256"], event.data.replace("0x", ""));
        var canonicalContractPath = path.resolve(data[0]);
        coverage[canonicalContractPath]["b"][data[1].toNumber()][data[2].toNumber()] += 1;
    }else if(event.topics.indexOf("b51abbff580b3a34bbc725f2dc6f736e9d4b45a41293fd0084ad865a31fde0c8")>=0){
        var data = SolidityCoder.decodeParams(["string","uint256"], event.data.replace("0x", ""));
        var canonicalContractPath = path.resolve(data[0]);
        coverage[canonicalContractPath]["s"][data[1].toNumber()]+= 1;
    }
}

fs.writeFileSync('./coverage.json', JSON.stringify(coverage));

shell.exec("./node_modules/istanbul/lib/cli.js report html")
testrpcProcess.kill();
shell.rm('-rf', './../contracts');
shell.mv('./../originalContracts', './../contracts');
