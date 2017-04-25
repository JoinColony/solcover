/* eslint-env node, mocha */

const assert = require('assert');
const shell = require('shelljs');
const fs = require('fs');
const childprocess = require('child_process');
const mock = require('./util/mockTruffle.js');

// shell.test alias for legibility
function pathExists(path) { return shell.test('-e', path); }

// tests run out of memory in CI without this
function collectGarbage() {
  if (global.gc) { global.gc(); }
}

describe('cli', () => {
  let testrpcProcess = null;
  const script = 'node ./exec.js';
  const port = 8555;

  const config = {
    dir: './mock',
    port,
    testing: true,
    silent: true, // <-- Set to false to debug tests
    norpc: true,
  };

  before(() => {
    const command = `./node_modules/ethereumjs-testrpc-sc/bin/testrpc --gasLimit 0xfffffffffff --port ${port}`;
    testrpcProcess = childprocess.exec(command);
  });

  afterEach(() => {
    mock.remove();
  });

  after(() => {
    testrpcProcess.kill();
  });

  // #1: The 'config' tests ask exec.js to run testrpc on special ports, the subsequent tests use
  // the testrpc launched in the before() block. For some reason config tests fail randomly
  // unless they are at the top of the suite. Hard to debug since they pass if logging is turned
  // on - there might be a timing issue around resource cleanup or something.
  //
  // #2: Creating repeated instances of testrpc hits the container memory limit on
  // CI so these tests are disabled for that context
  it('config with testrpc options string: should generate coverage, cleanup & exit(0)', () => {
    if (!process.env.CI) {
      const privateKey = '0x3af46c9ac38ee1f01b05f9915080133f644bf57443f504d339082cb5285ccae4';
      const balance = '0xfffffffffffffff';
      const testConfig = Object.assign({}, config);

      testConfig.testrpcOptions = `--account="${privateKey},${balance}" --port 8777`;
      testConfig.norpc = false;
      testConfig.port = 8777;

      // Installed test will process.exit(1) and crash truffle if the test isn't
      // loaded with the account specified above
      mock.install('Simple.sol', 'testrpc-options.js', testConfig);
      shell.exec(script);
      assert(shell.error() === null, 'script should not error');
      collectGarbage();
    }
  });

  it('config with test command options string: should run test', () => {
    if (!process.env.CI) {
      assert(pathExists('./allFiredEvents') === false, 'should start without: events log');
      const testConfig = Object.assign({}, config);

      testConfig.testCommand = 'mocha --timeout 5000 > /dev/null 2>&1';
      testConfig.norpc = false;
      testConfig.port = 8888;

      // Installed test will write a fake allFiredEvents to ./ after 4000ms
      // allowing test to pass
      mock.install('Simple.sol', 'command-options.js', testConfig);
      shell.exec(script);
      assert(shell.error() === null, 'script should not error');
      collectGarbage();
    }
  });

  it('simple contract: should generate coverage, cleanup & exit(0)', () => {
    // Directory should be clean
    assert(pathExists('./coverage') === false, 'should start without: coverage');
    assert(pathExists('./coverage.json') === false, 'should start without: coverage.json');

    // Run script (exits 0);
    mock.install('Simple.sol', 'simple.js', config);
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
    mock.install('OnlyCall.sol', 'only-call.js', config);

    shell.exec(script);
    assert(shell.error() === null, 'script should not error');

    assert(pathExists('./coverage') === true, 'script should gen coverage folder');
    assert(pathExists('./coverage.json') === true, 'script should gen coverage.json');

    const produced = JSON.parse(fs.readFileSync('./coverage.json', 'utf8'));
    const path = Object.keys(produced)[0];
    assert(produced[path].fnMap['1'].name === 'addTwo', 'coverage.json should map "addTwo"');
    collectGarbage();
  });

  it('contract uses inheritance: should generate coverage, cleanup & exit(0)', () => {
    // Run against a contract that 'is' another contract
    assert(pathExists('./coverage') === false, 'should start without: coverage');
    assert(pathExists('./coverage.json') === false, 'should start without: coverage.json');
    mock.installInheritanceTest(config);

    shell.exec(script);
    assert(shell.error() === null, 'script should not error');

    assert(pathExists('./coverage') === true, 'script should gen coverage folder');
    assert(pathExists('./coverage.json') === true, 'script should gen coverage.json');

    const produced = JSON.parse(fs.readFileSync('./coverage.json', 'utf8'));
    const ownedPath = Object.keys(produced)[0];
    const proxyPath = Object.keys(produced)[1];

    assert(produced[ownedPath].fnMap['1'].name === 'Owned', 'coverage.json should map "Owned"');
    assert(produced[proxyPath].fnMap['1'].name === 'isOwner', 'coverage.json should map "isOwner"');
    collectGarbage();
  });

  it('truffle tests failing: should generate coverage, cleanup & exit(0)', () => {
    assert(pathExists('./coverage') === false, 'should start without: coverage');
    assert(pathExists('./coverage.json') === false, 'should start without: coverage.json');

    // Run with Simple.sol and a failing assertion in a truffle test
    mock.install('Simple.sol', 'truffle-test-fail.js', config);
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
    mock.install('Expensive.sol', 'block-gas-limit.js', config);
    shell.exec(script);
    assert(shell.error() === null, 'script should not error');
    collectGarbage();
  });

  it('truffle crashes: should generate NO coverage, cleanup and exit(1)', () => {
    assert(pathExists('./coverage') === false, 'should start without: coverage');
    assert(pathExists('./coverage.json') === false, 'should start without: coverage.json');

    // Run with Simple.sol and a syntax error in the truffle test
    mock.install('Simple.sol', 'truffle-crash.js', config);
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
    mock.install('SimpleError.sol', 'simple.js', config);
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
    mock.install('Empty.sol', 'empty.js', config);
    shell.exec(script);
    assert(shell.error() !== null, 'script should error');
    assert(pathExists('./coverage') !== true, 'script should NOT gen coverage folder');
    assert(pathExists('./coverage.json') !== true, 'script should NOT gen coverage.json');
    collectGarbage();
  });
});
