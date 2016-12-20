const shell = require('shelljs')
const SolidityCoder = require('web3/lib/solidity/coder.js')
const coverage = {}
const fs = require('fs')
const path = require('path')
const getInstrumentedVersion = require('./instrumentSolidity.js')
const childprocess = require('child_process')
const truffleConfig = require('./../truffle.js')

/**
 * Removes coverage build artifacts, kills testrpc.
 * Exits (1) and prints msg on error, exits (0) otherwise.
 * @param  {String} err error message
 */
function cleanUp (err) {
  shell.config.silent = true
  shell.rm('-Rf', './coverageEnv')
  shell.rm('./allFiredEvents')
  testrpcProcess.kill()

  if (err) {
    console.log(err)
    console.log('exiting without generating coverage...')
    process.exit(1)
  } else {
    process.exit(0)
  }
}

// PAtch our local testrpc if necessary
if (!shell.test('-e', './node_modules/ethereumjs-vm/lib/opFns.js.orig')) {
  console.log('patch local testrpc...')
  shell.exec('patch -b ./node_modules/ethereumjs-vm/lib/opFns.js ./hookIntoEvents.patch')
}

// Run the modified testrpc with large block limit, on (hopefully) unused port
console.log('launching testrpc on port 8555')
try {
  var testrpcProcess = childprocess.exec('./node_modules/ethereumjs-testrpc/bin/testrpc --gasLimit 0xfffffffffff --port 8555')
} catch (err) {
  let msg = 'There was a problem launching testrpc: ' + err
  cleanUp(msg)
}

// Generate a copy of the target truffle project configured for solcover.
// NB: the following assumes that the target's truffle.js doesn't specify a custom build with an
// atypical directory structure or depend on the options solcover will change: port, gasLimit, gasPrice.
console.log('generating coverage environment')

truffleConfig.rpc.port = 8555
truffleConfig.rpc.gas = 0xfffffff
truffleConfig.rpc.gasPrice = 20e9

shell.mkdir('./coverageEnv')
shell.cp('-R', './../contracts', './coverageEnv')
shell.cp('-R', './../migrations', './coverageEnv')
shell.cp('-R', './../test', './coverageEnv')

fs.writeFileSync('./coverageEnv/truffle.js', 'module.exports = ' + JSON.stringify(truffleConfig))

// For each contract in originalContracts, get the instrumented version
try {
  shell.ls('./coverageEnv/contracts/*.sol').forEach(function (file) {
    if (file !== './coverageEnv/contracts/Migrations.sol') {
      console.log('instrumenting ', file)
      let contract = fs.readFileSync('./' + file).toString()
      let fileName = path.basename(file)
      let instrumentedContractInfo = getInstrumentedVersion(contract, fileName, true)
      fs.writeFileSync('./coverageEnv/contracts/' + path.basename(file), instrumentedContractInfo.contract)
      let canonicalContractPath = path.resolve('./../contracts/' + path.basename(file))
      coverage[canonicalContractPath] = { 'l': {}, 'path': canonicalContractPath, 's': {}, 'b': {}, 'f': {}, 'fnMap': {}, 'statementMap': {}, 'branchMap': {} }
      for (let idx in instrumentedContractInfo.runnableLines) {
        coverage[canonicalContractPath]['l'][instrumentedContractInfo.runnableLines[idx]] = 0
      }
      coverage[canonicalContractPath].fnMap = instrumentedContractInfo.fnMap
      for (let x = 1; x <= Object.keys(instrumentedContractInfo.fnMap).length; x++) {
        coverage[canonicalContractPath]['f'][x] = 0
      }
      coverage[canonicalContractPath].branchMap = instrumentedContractInfo.branchMap
      for (let x = 1; x <= Object.keys(instrumentedContractInfo.branchMap).length; x++) {
        coverage[canonicalContractPath]['b'][x] = [0, 0]
      }
      coverage[canonicalContractPath].statementMap = instrumentedContractInfo.statementMap
      for (let x = 1; x <= Object.keys(instrumentedContractInfo.statementMap).length; x++) {
        coverage[canonicalContractPath]['s'][x] = 0
      }
    }
  })
} catch (err) {
  cleanUp(err)
}

try {
  console.log('launching Truffle (this can take a few seconds)...')
  shell.exec('cd coverageEnv && truffle test --network coverage')
} catch (err) {
  cleanUp(err)
}

try {
  var events = fs.readFileSync('./allFiredEvents').toString().split('\n')
} catch (err) {
  let msg =
  `
    There was an error generating coverage. Possible reasons include:
    1. Another application is using port 8555 
    2. Truffle crashed because your tests errored
    
  `
  cleanUp(msg + err)
}

console.log('generating coverage report')
for (let idx = 0; idx < events.length - 1; idx++) {
  // The limit here isn't a bug - there is an empty line at the end of this file, so we don't
  // want to go to the very end of the array.
  let event = JSON.parse(events[idx])
  if (event.topics.indexOf('b8995a65f405d9756b41a334f38d8ff0c93c4934e170d3c1429c3e7ca101014d') >= 0) {
    let data = SolidityCoder.decodeParams(['string', 'uint256'], event.data.replace('0x', ''))
    let canonicalContractPath = path.resolve('./../contracts/' + path.basename(data[0]))
    coverage[canonicalContractPath]['l'][data[1].toNumber()] += 1
  } else if (event.topics.indexOf('d4ce765fd23c5cc3660249353d61ecd18ca60549dd62cb9ca350a4244de7b87f') >= 0) {
    let data = SolidityCoder.decodeParams(['string', 'uint256'], event.data.replace('0x', ''))
    let canonicalContractPath = path.resolve('./../contracts/' + path.basename(data[0]))
    coverage[canonicalContractPath]['f'][data[1].toNumber()] += 1
  } else if (event.topics.indexOf('d4cf56ed5ba572684f02f889f12ac42d9583c8e3097802060e949bfbb3c1bff5') >= 0) {
    let data = SolidityCoder.decodeParams(['string', 'uint256', 'uint256'], event.data.replace('0x', ''))
    let canonicalContractPath = path.resolve('./../contracts/' + path.basename(data[0]))
    coverage[canonicalContractPath]['b'][data[1].toNumber()][data[2].toNumber()] += 1
  } else if (event.topics.indexOf('b51abbff580b3a34bbc725f2dc6f736e9d4b45a41293fd0084ad865a31fde0c8') >= 0) {
    let data = SolidityCoder.decodeParams(['string', 'uint256'], event.data.replace('0x', ''))
    let canonicalContractPath = path.resolve('./../contracts/' + path.basename(data[0]))
    coverage[canonicalContractPath]['s'][data[1].toNumber()] += 1
  }
}

fs.writeFileSync('./coverage.json', JSON.stringify(coverage))
shell.exec('./node_modules/istanbul/lib/cli.js report html')
cleanUp()
