'use strict'

contract('OnlyCall', (accounts) => {
  it('should return 5', () => {
    const onlyCall = OnlyCall.deployed();
    return onlyCall.getFive.call()
        .then(val => assert.equal(val, 5));
  });
});
