// Test in this contract makes a false assertion
contract('Simple', (accounts) => {
  it('should set x to 5', () => {
    const simple = Simple.deployed();
    return simple.test(5)
        .then(simple.getX.call()
        .then(val => assert.equal(val.toNumber(), 4)), // <-- Should equal 5, not 4
    );
  });
});
