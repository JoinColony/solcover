
/*
  This file contains utilities for generating a mock truffle project to test solcover's
  run script against.
 */
const fs = require('fs');
const shell = require('shelljs');

/**
 * Installs mock truffle project at ./mock with a single contract
 * and test specified by the params.
 * @param  {String} contract <contractName.sol> located in /test/sources/cli/
 * @param  {[type]} test     <testName.js> located in /test/cli/
 */
module.exports.install = function install(contract, test, config) {
  shell.mkdir('./mock');
  shell.mkdir('./mock/contracts');
  shell.mkdir('./mock/migrations');
  shell.mkdir('./mock/test');

  // Mock contracts
  if (Array.isArray(contract)) {
    contract.forEach(item => {
      shell.cp(`./test/sources/cli/${item}`, `./mock/contracts/${item}`);
    });
  } else {
    shell.cp(`./test/sources/cli/${contract}`, `./mock/contracts/${contract}`);
  }

  shell.cp('./test/sources/cli/Migrations.sol', './mock/contracts/Migrations.sol');

  // Mock migrations
  const initialMigration = `
    let Migrations = artifacts.require('Migrations.sol');
    module.exports = function(deployer) {
      deployer.deploy(Migrations);
    };`;

  const contractLocation = `./${contract}`;
  const deployContracts = `
    var contract = artifacts.require('${contractLocation}');
    module.exports = function(deployer) {
      deployer.deploy(contract);
    };`;

  fs.writeFileSync('./mock/migrations/1_initial_migration.js', initialMigration);
  fs.writeFileSync('./mock/migrations/2_deploy_contracts.js', deployContracts);

  // Mock test
  shell.cp(`./test/cli/${test}`, `./mock/test/${test}`);

  // Mock truffle.js
  const trufflejs = `module.exports = {
                    networks: {
                      development: {
                        host: "localhost", 
                        port: 8545,
                        network_id: "*"
                      }}};`
                  ;

  const configjs = `module.exports = ${JSON.stringify(config)}`;

  fs.writeFileSync('./mock/truffle.js', trufflejs);
  fs.writeFileSync('./.solcover.js', configjs);
};

/**
 * Installs mock truffle project at ./mock with a single contract
 * and test specified by the params.
 * @param  {String} contract <contractName.sol> located in /test/sources/cli/
 * @param  {[type]} test     <testName.js> located in /test/cli/
 */
module.exports.installInheritanceTest = function installInheritanceTest(config) {
  shell.mkdir('./mock');
  shell.mkdir('./mock/contracts');
  shell.mkdir('./mock/migrations');
  shell.mkdir('./mock/test');

  // Mock contracts
  shell.cp('./test/sources/cli/Proxy.sol', './mock/contracts/Proxy.sol');
  shell.cp('./test/sources/cli/Owned.sol', './mock/contracts/Owned.sol');
  shell.cp('./test/sources/cli/Migrations.sol', './mock/contracts/Migrations.sol');

  // Mock migrations
  const initialMigration = `
    let Migrations = artifacts.require('Migrations.sol');
    module.exports = function(deployer) {
      deployer.deploy(Migrations);
    };`;

  const deployContracts = `
    var Owned = artifacts.require('./Owned.sol');
    var Proxy = artifacts.require('./Proxy.sol');
    module.exports = function(deployer) {
      deployer.deploy(Owned);
      deployer.link(Owned, Proxy);
      deployer.deploy(Proxy);
    };`;

  fs.writeFileSync('./mock/migrations/1_initial_migration.js', initialMigration);
  fs.writeFileSync('./mock/migrations/2_deploy_contracts.js', deployContracts);

  // Mock test
  shell.cp('./test/cli/inheritance.js', './mock/test/inheritance.js');

  // Mock truffle.js
  const trufflejs = `module.exports = {
                    networks: {
                      development: {
                        host: "localhost", 
                        port: 8545,
                        network_id: "*"
                      }}};`
                  ;

  const configjs = `module.exports = ${JSON.stringify(config)}`;

  fs.writeFileSync('./mock/truffle.js', trufflejs);
  fs.writeFileSync('./.solcover.js', configjs);
};

/**
 * Removes mock truffle project and coverage reports generated by exec.js
 */
module.exports.remove = function remove() {
  shell.config.silent = true;
  shell.rm('./.solcover.js');
  shell.rm('-Rf', 'mock');
  shell.rm('-Rf', 'coverage');
  shell.rm('coverage.json');
  shell.config.silent = false;
};
