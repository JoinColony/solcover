// This test should break truffle because it has a syntax error.
contract('Simple', function(accounts){
  it('should crash', function(){
    return Simple.deployed().then.then.
  })
})