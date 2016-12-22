'use strict'

const assert = require('assert');
const shell = require('shelljs');
const fs = require('fs');
const childprocess = require('child_process');
const mock = require('./util/mockTruffle.js');

// shell.test alias for legibility
function pathExists(path) { return shell.test('-e', path); }

describe('run', () => {
  const script = 'node ./runCoveredTests --dir "./mock" --silent "true"';

  before(() => {
    mock.initialize(shell);
    mock.protectCoverage();
  });
  after(() => {
    mock.restoreCoverage();
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
  });

  it('background testpc running: should succeed', () => {
    // This test needs changes to the CI script to work correctly.
    // Launch a globally installed, upatched testrpc.
    // const command = './testrpc';
    // const testrpc = childprocess.exec(command);

    // Run against contract that only uses method.call. If the unpatched testrpc intercepts
    // truffle then no events will be fired & solcover should fail.
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
    // testrpc.kill();
  });

  it('truffle tests failing: should succeed', () => {
    assert(pathExists('./coverage') === false, 'should start without: coverage');
    assert(pathExists('./coverage.json') === false, 'should start without: coverage.json');

    // Run with Simple.sol and a legitimate test failure
    mock.install('Simple.sol', 'truffle-test-fail.js');
    shell.exec(script);

    assert(shell.error() === null, 'script should not error');
    assert(pathExists('./coverage') === true, 'script should gen coverage folder');
    assert(pathExists('./coverage.json') === true, 'script should gen coverage.json');

    const produced = JSON.parse(fs.readFileSync('./coverage.json', 'utf8'));
    const path = Object.keys(produced)[0];
    assert(produced[path].fnMap['1'].name === 'test', 'coverage.json should map "test"');
    assert(produced[path].fnMap['2'].name === 'getX', 'coverage.json should map "getX"');
  });

  it('contract deployment exceeds normal block gasLimit: should succeed', () => {
    // Just making sure Expensive.sol compiles and deploys here.
    mock.install('Expensive.sol', 'block-gas-limit.js');
    shell.exec(script);
    assert(shell.error() === null, 'script should not error');
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
  });

  it('no events log produced: should generate NO coverage, cleanup and exit(1)', () => {
    // Run test that passes otherwise
    assert(pathExists('./coverage') === false, 'should start without: coverage');
    assert(pathExists('./coverage.json') === false, 'should start without: coverage.json');
    mock.install('Empty.sol', 'Empty.js');

    shell.exec(script);
    assert(shell.error() !== null, 'script should error');
    assert(pathExists('./coverage') !== true, 'script should NOT gen coverage folder');
    assert(pathExists('./coverage.json') !== true, 'script should NOT gen coverage.json');
  });
});

