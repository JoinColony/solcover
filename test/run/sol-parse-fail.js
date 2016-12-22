'use strict'

contract('SimpleError', (accounts) => {
  it('should set x to 5', () => {
    const simple = Simple.deployed();
    return simple.test(5)
        .then(simple.getX.call()
        .then(val => assert.equal(val, 5)));
  });
});
