'use strict'

const assert = require('assert');
const shell = require('shelljs');
const fs = require('fs');
const childprocess = require('child_process');
const mock = require('./util/mockTruffle.js');

// shell.test alias for legibility
function pathExists(path) { return shell.test('-e', path); }

// tests run out of memory in CI without this
function collectGarbage() {
  if(global.gc)
    global.gc();
}

describe('run', () => {

  let port = 8555;
  let testrpcProcess = null;
  let script = `node ./runCoveredTests --dir "./mock" --port ${port} --norpc --silent`;
  
  before(() => {
    mock.protectCoverage();

    // Launch patched testrpc from test - CI (Ubuntu) doesn't seem to be freeing  
    // server resources until the parent process of these tests exits so there are errors launching
    // testrpc repeatedly on the same port. runCoveredTests script gets passed a --norpc 
    // flag which skips the testrpc launch there. It's important this be **the same code** that
    // runs in the script - otherwise the patch isn't getting checked.  
    if (!shell.test('-e', './node_modules/ethereumjs-vm/lib/opFns.js.orig')) {
      shell.exec('patch -b ./node_modules/ethereumjs-vm/lib/opFns.js ./hookIntoEvents.patch');
    }
    const command = `./node_modules/ethereumjs-testrpc/bin/testrpc --gasLimit 0xfffffffffff --port ${port}`;
    testrpcProcess = childprocess.exec(command);
  });

  after(() => {
    mock.restoreCoverage();
    testrpcProcess.kill();
  });
  
  afterEach(() => {
    mock.remove();
  });

  it('simple contract: should generate coverage, cleanup & exit(0)', () => {
    // Directory should be clean
    assert(pathExists('./coverage') === false, 'should start without: coverage');
    assert(pathExists('./coverage.json') === false, 'should start without: coverage.json');

    // Run script (exits 0);
    mock.install('Simple.sol', 'simple.js');
    shell.exec(script);
    assert(shell.error() === null, 'script should not error');

    // Directory should have coverage report
    assert(pathExists('./coverage') === true, 'script should gen coverage folder');
    assert(pathExists('./coverage.json') === true, 'script should gen coverage.json');

    // Coverage should be real.
    // This test is tightly bound to the function names in Simple.sol
    const produced = JSON.parse(fs.readFileSync('./coverage.json', 'utf8'));
    const path = Object.keys(produced)[0];
    assert(produced[path].fnMap['1'].name === 'test', 'coverage.json should map "test"');
    assert(produced[path].fnMap['2'].name === 'getX', 'coverage.json should map "getX"');
    collectGarbage(); 
  });

  it('contract only uses .call: should generate coverage, cleanup & exit(0)', () => {
    // Run against contract that only uses method.call. 
    assert(pathExists('./coverage') === false, 'should start without: coverage');
    assert(pathExists('./coverage.json') === false, 'should start without: coverage.json');
    mock.install('OnlyCall.sol', 'only-call.js');
    
    shell.exec(script);
    assert(shell.error() === null, 'script should not error');
    
    assert(pathExists('./coverage') === true, 'script should gen coverage folder');
    assert(pathExists('./coverage.json') === true, 'script should gen coverage.json');

    const produced = JSON.parse(fs.readFileSync('./coverage.json', 'utf8'));
    const path = Object.keys(produced)[0];
    assert(produced[path].fnMap['1'].name === 'getFive', 'coverage.json should map "getFive"');
    collectGarbage(); 
  });

  it('truffle tests failing: should generate coverage, cleanup & exit(0)', () => {
    assert(pathExists('./coverage') === false, 'should start without: coverage');
    assert(pathExists('./coverage.json') === false, 'should start without: coverage.json');

    // Run with Simple.sol and a failing assertion in a truffle test
    mock.install('Simple.sol', 'truffle-test-fail.js');
    shell.exec(script);
    assert(shell.error() === null, 'script should not error');
    assert(pathExists('./coverage') === true, 'script should gen coverage folder');
    assert(pathExists('./coverage.json') === true, 'script should gen coverage.json');

    const produced = JSON.parse(fs.readFileSync('./coverage.json', 'utf8'));
    const path = Object.keys(produced)[0];
    assert(produced[path].fnMap['1'].name === 'test', 'coverage.json should map "test"');
    assert(produced[path].fnMap['2'].name === 'getX', 'coverage.json should map "getX"');
    collectGarbage(); 
  });

  it('deployment cost > block gasLimit: should generate coverage, cleanup & exit(0)', () => {
    // Just making sure Expensive.sol compiles and deploys here.
    mock.install('Expensive.sol', 'block-gas-limit.js');
    shell.exec(script);
    assert(shell.error() === null, 'script should not error');
    collectGarbage(); 
  });

  it('truffle crashes: should generate NO coverage, cleanup and exit(1)', () => {
    assert(pathExists('./coverage') === false, 'should start without: coverage');
    assert(pathExists('./coverage.json') === false, 'should start without: coverage.json');

    // Run with Simple.sol and a syntax error in the truffle test
    mock.install('Simple.sol', 'truffle-crash.js');
    shell.exec(script);
    assert(shell.error() !== null, 'script should error');
    assert(pathExists('./coverage') !== true, 'script should NOT gen coverage folder');
    assert(pathExists('./coverage.json') !== true, 'script should NOT gen coverage.json');
    collectGarbage(); 
  });

  it('instrumentation errors: should generate NO coverage, cleanup and exit(1)', () => {
    assert(pathExists('./coverage') === false, 'should start without: coverage');
    assert(pathExists('./coverage.json') === false, 'should start without: coverage.json');

    // Run with SimpleError.sol (has syntax error) and working truffle test
    mock.install('SimpleError.sol', 'simple.js');
    shell.exec(script);
    assert(shell.error() !== null, 'script should error');
    assert(pathExists('./coverage') !== true, 'script should NOT gen coverage folder');
    assert(pathExists('./coverage.json') !== true, 'script should NOT gen coverage.json');
    collectGarbage(); 
  });

  it('no events log produced: should generate NO coverage, cleanup and exit(1)', () => {
    // Run contract and test that pass but fire no events
    assert(pathExists('./coverage') === false, 'should start without: coverage');
    assert(pathExists('./coverage.json') === false, 'should start without: coverage.json');
    mock.install('Empty.sol', 'empty.js');
    shell.exec(script);
    assert(shell.error() !== null, 'script should error');
    assert(pathExists('./coverage') !== true, 'script should NOT gen coverage folder');
    assert(pathExists('./coverage.json') !== true, 'script should NOT gen coverage.json');
    collectGarbage(); 
  });
});
  