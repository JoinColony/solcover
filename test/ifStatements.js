var solc = require('solc');

var getInstrumentedVersion = require('./../instrumentSolidity.js');
var pragma = "pragma solidity ^0.4.3;\n";

describe('if statements', function(){
  it('should instrument if statements with no brackets',function(){
  	this.timeout(10000)
  		var contract= pragma + "contract Test{\n\
  			function a(uint x){\n\
	  			if (x==1) throw;\n\
  			}\n\
  		}"
		var instrumentedContractInfo = getInstrumentedVersion(contract, "test.sol", true);
		var output = solc.compile(instrumentedContractInfo.contract, 1); // 1 activates the optimiser
		if (output.errors){
			throw new Error("Instrumented solidity invalid: " + output.errors)
		}
    })
  it('should instrument if statements with brackets',function(){
  	this.timeout(10000)
  		var contract= pragma + "contract Test{\n\
  			function a(uint x){\n\
	  			if (x==1) { throw; }\n\
  			}\n\
  		}"
		var instrumentedContractInfo = getInstrumentedVersion(contract, "test.sol", true);
		var output = solc.compile(instrumentedContractInfo.contract, 1); // 1 activates the optimiser
		if (output.errors){
			throw new Error("Instrumented solidity invalid: " + output.errors)
		}
    })
  it('should instrument if statements with no brackets when consequent is on following line',function(){
    this.timeout(10000)
        var contract= pragma + "contract Test{\n\
            function a(uint x){\n\
                if (x==1)\n\
                    throw;\n\
            }\n\
        }"
        var instrumentedContractInfo = getInstrumentedVersion(contract, "test.sol", true);
        var output = solc.compile(instrumentedContractInfo.contract, 1); // 1 activates the optimiser
        if (output.errors){
            throw new Error("Instrumented solidity invalid: " + output.errors)
        }
    })
   it('should instrument nested if statements with missing else statements',function(){
  	this.timeout(10000)
  		var contract= pragma + "contract Test{\n\
  			function a(uint x,uint y, uint z){\n\
	  			if (x==y){\n\
			  	}else if ( x==2 ){\n\
			  		if (y==z){\n\
				  	}\n\
	  			}\n\
	  		}\n\
  		}"
		var instrumentedContractInfo = getInstrumentedVersion(contract, "test.sol", true);
		var output = solc.compile(instrumentedContractInfo.contract, 1); // 1 activates the optimiser
		if (output.errors){
			throw new Error("Instrumented solidity invalid: " + output.errors)
		}
    })
   it('should instrument else statements with no brackets when consequent is on following line',function(){
    this.timeout(10000)
        var contract= pragma + "contract Test{\n\
            function a(uint x){\n\
                if (x==1)\n\
                    throw;\n\
                else\n\
                    x=2;\n\
            }\n\
        }"
        var instrumentedContractInfo = getInstrumentedVersion(contract, "test.sol", true);
        var output = solc.compile(instrumentedContractInfo.contract, 1); // 1 activates the optimiser
        if (output.errors){
            throw new Error("Instrumented solidity invalid: " + output.errors)
        }
    })
  })