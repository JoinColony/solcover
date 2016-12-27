'use strict'

const shell = require('shelljs');
const fs = require('fs');
const path = require('path');
const argv = require('yargs').argv;
const childprocess = require('child_process');
const SolidityCoder = require('web3/lib/solidity/coder.js');
const getInstrumentedVersion = require('./instrumentSolidity.js');

// Locals
const coverage = {};
const Console = {};
const coverageDir = './coverageEnv'; 
let workingDir = './..';
let port = 8555;
let testrpcProcess = null;
let events = null;
let silence = '';

// Set target's working directory relative to solcover execution context
if (argv.dir) {
  workingDir = argv.dir;
}

// Set log level
if (argv.silent) {
  Console.log = () => {};
  silence = '> /dev/null 2>&1';
} else {
  Console.log = console.log;
}

// Set testrpc/truffle port
if (argv.port){
  port = argv.port;
}

// Get target truffle config to modify for solCover
const truffleConfig = require(`${workingDir}/truffle.js`);

/**
 * Removes coverage build artifacts, kills testrpc.
 * Exits (1) and prints msg on error, exits (0) otherwise.
 * @param  {String} err error message
 */
function cleanUp(err) {
  Console.log('Cleaning up...');
  shell.config.silent = true;
  shell.rm('-Rf', `${coverageDir}`);
  shell.rm('./allFiredEvents');
  testrpcProcess.kill();

  if (err) {
    Console.log(`${err}\nExiting without generating coverage...`);
    process.exit(1);
  } else {
    process.exit(0);
  }
}

// Patch our local testrpc if necessary
if (!shell.test('-e', './node_modules/ethereumjs-vm/lib/opFns.js.orig')) {
  Console.log('Patch local testrpc...');
  shell.exec('patch -b ./node_modules/ethereumjs-vm/lib/opFns.js ./hookIntoEvents.patch');
}

// Run the modified testrpc with large block limit, on (hopefully) unused port
Console.log(`Launching testrpc on port ${port}`);
try {
  const command = `./node_modules/ethereumjs-testrpc/bin/testrpc --gasLimit 0xfffffffffff --port ${port}`;
  testrpcProcess = childprocess.exec(command);
} catch (err) {
  const msg = `There was a problem launching testrpc: ${err}`;
  cleanUp(msg);
}

// Generate a copy of the target truffle project configured for solcover.
// NB: the following assumes that the target's truffle.js doesn't specify a custom build with an
// atypical directory structure or depend on the options solcover will change: port, gasLimit,
// gasPrice.
Console.log('Generating coverage environment');

truffleConfig.rpc.port = port;
truffleConfig.rpc.gas = 0xfffffff;
truffleConfig.rpc.gasPrice = 20e9;

shell.mkdir(`${coverageDir}`);
shell.cp('-R', `${workingDir}/contracts`, `${coverageDir}`);
shell.cp('-R', `${workingDir}/migrations`, `${coverageDir}`);
shell.cp('-R', `${workingDir}/test`, `${coverageDir}`);

fs.writeFileSync(`${coverageDir}/truffle.js`, `module.exports = ${JSON.stringify(truffleConfig)}`);

// For each contract in originalContracts, get the instrumented version
try {
  shell.ls(`${coverageDir}/contracts/*.sol`).forEach((file) => {
    if (file !== `${coverageDir}/contracts/Migrations.sol`) {
      Console.log('Instrumenting ', file);
      const contract = fs.readFileSync(`./${file}`).toString();
      const fileName = path.basename(file);
      const instrumentedContractInfo = getInstrumentedVersion(contract, fileName, true);
      fs.writeFileSync(`${coverageDir}/contracts/${path.basename(file)}`, instrumentedContractInfo.contract);
      const canonicalContractPath = path.resolve(`${workingDir}/contracts/${path.basename(file)}`);
      coverage[canonicalContractPath] = {
        l: {},
        s: {},
        b: {},
        f: {},
        fnMap: {},
        statementMap: {},
        branchMap: {},
        path: canonicalContractPath,
      };

      for (const idx in instrumentedContractInfo.runnableLines) {
        coverage[canonicalContractPath].l[instrumentedContractInfo.runnableLines[idx]] = 0;
      }
      coverage[canonicalContractPath].fnMap = instrumentedContractInfo.fnMap;
      for (let x = 1; x <= Object.keys(instrumentedContractInfo.fnMap).length; x++) {
        coverage[canonicalContractPath].f[x] = 0;
      }
      coverage[canonicalContractPath].branchMap = instrumentedContractInfo.branchMap;
      for (let x = 1; x <= Object.keys(instrumentedContractInfo.branchMap).length; x++) {
        coverage[canonicalContractPath].b[x] = [0, 0];
      }
      coverage[canonicalContractPath].statementMap = instrumentedContractInfo.statementMap;
      for (let x = 1; x <= Object.keys(instrumentedContractInfo.statementMap).length; x++) {
        coverage[canonicalContractPath].s[x] = 0;
      }
    }
  });
} catch (err) {
  cleanUp(err);
}

// Run truffle test on instrumented contracts
try {
  Console.log('Launching Truffle (this can take a few seconds)...');
  const command = `cd coverageEnv && truffle test --network coverage ${silence}`;
  shell.exec(command);
} catch (err){
  cleanUp(err);
}

// Get events fired during instrumented contracts execution.
try {
  events = fs.readFileSync('./allFiredEvents').toString().split('\n');
} catch (err) {
  const msg =
  `
    There was an error generating coverage. Possible reasons include:
    1. Another application is using port ${port} 
    2. Truffle crashed because your tests errored
    
  `;
  cleanUp(msg + err);
}

// Generate coverage report from events logs
Console.log('Generating coverage report');
for (let idx = 0; idx < events.length - 1; idx++) {
  // The limit here isn't a bug - there is an empty line at the end of this file, so we don't
  // want to go to the very end of the array.
  const event = JSON.parse(events[idx]);
  if (event.topics.indexOf('b8995a65f405d9756b41a334f38d8ff0c93c4934e170d3c1429c3e7ca101014d') >= 0) {
    const data = SolidityCoder.decodeParams(['string', 'uint256'], event.data.replace('0x', ''));
    const canonicalContractPath = path.resolve(`${workingDir}/contracts/${path.basename(data[0])}`);
    coverage[canonicalContractPath].l[data[1].toNumber()] += 1;
  } else if (event.topics.indexOf('d4ce765fd23c5cc3660249353d61ecd18ca60549dd62cb9ca350a4244de7b87f') >= 0) {
    const data = SolidityCoder.decodeParams(['string', 'uint256'], event.data.replace('0x', ''));
    const canonicalContractPath = path.resolve(`${workingDir}/contracts/${path.basename(data[0])}`);
    coverage[canonicalContractPath].f[data[1].toNumber()] += 1;
  } else if (event.topics.indexOf('d4cf56ed5ba572684f02f889f12ac42d9583c8e3097802060e949bfbb3c1bff5') >= 0) {
    const data = SolidityCoder.decodeParams(['string', 'uint256', 'uint256'], event.data.replace('0x', ''));
    const canonicalContractPath = path.resolve(`${workingDir}/contracts/${path.basename(data[0])}`);
    coverage[canonicalContractPath].b[data[1].toNumber()][data[2].toNumber()] += 1;
  } else if (event.topics.indexOf('b51abbff580b3a34bbc725f2dc6f736e9d4b45a41293fd0084ad865a31fde0c8') >= 0) {
    const data = SolidityCoder.decodeParams(['string', 'uint256'], event.data.replace('0x', ''));
    const canonicalContractPath = path.resolve(`${workingDir}/contracts/${path.basename(data[0])}`);
    coverage[canonicalContractPath].s[data[1].toNumber()] += 1;
  }
}

// Write coverage report / run istanbul
fs.writeFileSync('./coverage.json', JSON.stringify(coverage));
shell.exec(`./node_modules/istanbul/lib/cli.js report html ${silence}`);

// Finish
cleanUp();
  