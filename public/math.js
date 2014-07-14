// Complex numbers
function Complex (real, imag) {
  this.real = real || 0;
  this.imag = imag || 0;
}

Complex.prototype.add = function(z){
  return new Complex(this.real+z.real, this.imag+z.imag);
};

Complex.prototype.sub = function(z){
  return new Complex(this.real-z.real, this.imag-z.imag);
};

Complex.prototype.mul = function(z){
  var a = this.real*z.real - this.imag*z.imag,
      b = this.real*z.imag + this.imag*z.real;
  return new Complex(a, b);
};

Complex.prototype.div = function(z){
  if (z.real==0 && z.imag==0)
    throw new Error('Division by zero.');
  var c = z.real*z.real + z.imag*z.imag,
      a = (this.real*z.real + this.imag*z.imag) / c,
      b = (this.imag*z.real - this.real*z.imag) / c;
  return new Complex(a, b);
};

Complex.prototype.conj = function(){
  return new Complex (this.real, -this.imag);
};

Complex.prototype.toString = function(){
  var str = '';
  var a = this.real;
  var b = this.imag;

  if (a==0 && b==0) return "0";

  if (a != 0)
    str += a + '';
  
  if (b != 0){
    if (a!=0 && b>=0) 
      str += '+';
    else if (b<0){
      str += '-';
      b = -b;
    }
    // assert b>=0 
    if (b!=1)
      str += b;
    str += 'i';
  }
  return str;
};


// Complex evaluated functions

function CFunction (f) {
  this.f = f;
}

CFunction.prototype.call = function(){
  return this.f.apply(this, arguments);
};

CFunction.prototype.add = function(g){
  return new CFunction(function(z){
    return this.call(z).add( g.call(z) );
  });
};

CFunction.prototype.sub = function(){
  return new CFunction(function(z){
    return this.call(z).sub( g.call(z) );
  });
};

CFunction.prototype.mul = function(){
  return new CFunction(function(z){
    return this.call(z).mul ( g.call(z) );
  });
};

CFunction.prototype.div = function(){
  return new CFunction(function(z){
    return this.call(z).div ( g.call(z) );
  });
};

CFunction.prototype.real = function(){
  return new CFunction(function(){
    return this.call(z).real;
  });
};

CFunction.prototype.imag = function(){
  return new CFunction(function(){
    return this.call(z).imag;
  });
};

CFunction.prototype.toString = function(){
  return "[Function]";
}



// Simple math language

function Variable (name) {
  this.name = name;
}

Variable.prototype.toString = function(){
  return this.name;
}
  

function tokenize (string) {
  var regex = /\s*([+\-*/\(\)=^]|[0-9]+\.?[0-9]*|[a-zA-Z]+)\s*/g;
  var tokens = string.replace(regex,':$1').substring(1).split(':');
  for (var i=0, s=tokens.length; i<s; i++){
    var token = tokens[i];
    if (/^[0-9]+\.?[0-9]*$/.test(token))
      tokens[i] = new Complex(parseFloat(token));
    else if (token.length===1 && "+-*/=()^".indexOf(token) >= 0)
      tokens[i] = token;
    else
      tokens[i] = new Variable(token);
  }
  return tokens;
}

function Operation (op,a,b) {
  this.op = op;
  this.a = a;
  this.b = b;
}

Operation.prototype.toString = function(){
  return JSON.stringify(this);
};


function parseTokens (tokens) {

  function rule (operators, subrule){
    var parsed = subrule();
    while (operators.indexOf(tokens[0]) >= 0)
      parsed = new Operation(tokens.shift(), parsed, subrule());
    return parsed;
  }

  function declarations () {
    var decl = rule(['='], expression);
    if (decl instanceof Operation && decl.op==='=' && typeof decl.a instanceof Variable)
      throw new Error (decl.a + ' is not a variable.');
    return decl;
  }

  var expression = additions;

  function additions (){
    switch(tokens[0]){
    case '+': tokens.shift();    break;
    case '-': tokens.unshift(new Complex(0)); break;
    }
    return rule(['+', '-'], multiplications);
  }

  function multiplications () {
    return rule(['*', '/'], concatenation);
  }

  // Higher precedence multiplication
  function concatenation () {
    var ops = ['+','-','*','/','^','='];
    var parsed = powers();
    while (tokens.length>0 && (tokens[0] instanceof Complex || tokens[0] instanceof Variable))
      parsed = new Operation('*', parsed, powers());
    return parsed;
  }

  function powers () {
    return rule(['^'], refs);
  }

  function refs () {
    var ref;
    if (tokens[0] === '('){
      tokens.shift();
      ref = expression();
      if (tokens.shift() !== ')')
        throw new Error ("Expected `)'.");
    } else if (tokens[0] instanceof Complex) {
      // Early quit. Numbers cannot be followed by arguments
      // gramatically.
      return tokens.shift();
    } else if (tokens[0] instanceof Variable){
      ref = tokens.shift();
    }

    // Call
    if (tokens[0] === '('){
      tokens.shift();
      ref =  new Operation('call', ref, expression());
      if (tokens.shift() !== ')')
        throw new Error ("Expected `)'.");
    }
    return ref;
  }

  return declarations();
}


// Compiler

function compileAtom (atom) {
  if (atom instanceof Variable)
    return compileVariable(atom);
  else 
    return function(scope){ return atom; };
}

function compileVariable (variable) {
  return function(scope){ 
    if (variable in scope)
      return scope[variable]; 
    else
      throw new Error('Unknown variable "' + variable + '"');
  };
}


function compileOperation (tree) {
  var oper1 = compileTree(tree.a);
  var oper2 = compileTree(tree.b);
  switch (tree.op){
  case '+':
    return function(scope){ return oper1(scope).add(oper2(scope)); };
  case '-':
    return function(scope){ return oper1(scope).sub(oper2(scope)); };
  case '*':
    return function(scope){ return oper1(scope).mul(oper2(scope)); };
  case '/':
    return function(scope){ return oper1(scope).div(oper2(scope)); };
  case '^':
    return function(scope){ return Math.pow(oper1(scope), oper2(scope)); };
  case '=':
    return function(scope){
      var variable = tree.a;
      var oldvalue = scope[variable]
      var newvalue = oper2(scope);
      if (variable in scope)
        throw new Error(variable + ' is already bound.');
      return scope[variable] = newvalue;
    };
  case 'call':
    return function(scope){ 
      var func = oper1(scope);
      var arg = oper2(scope);
      return func.call(arg); 
    };
  }
}

function compileTree (tree) {
  if (tree instanceof Operation)
    return compileOperation(tree);
  else
    return compileAtom(tree);
}


function parse (string) {
  return parseTokens(tokenize(string));
}

function compile (string) {
  return compileTree(parse(string));
}

function evaluate (string, scope) {
  scope = scope || {};
  return compile(string)(scope);
}



// Interactivity (Node.js)

if (typeof module !== 'undefined') {

  var readline = require('readline');

  var rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  rl.setPrompt('> ');
  rl.prompt();
  var scope = {
    "pi": Math.PI,
    "e": Math.E,
    "i": new Complex(0,1),
    "sqrt": new CFunction(function(x){ return Math.sqrt(x); }),
    "cos": new CFunction(function(x){ return Math.cos(x); }),
    "sin": new CFunction(function(x){ return Math.sin(x); }),
    "tan": new CFunction(function(x){ return Math.tan(x); }),
    "conj": new CFunction(function(x){ return x.conj(); })
  };
  rl.on('line', function(line){
    try {
      var output;
      if (line.length>0 && line[0]===',')
        console.log(JSON.stringify(parse(line.substring(1))));
      else
        console.log('' + evaluate(line, scope));
    } catch(e){
      console.error(e.message);
    }
    rl.prompt();
  })

}




// Compiler

function GLSLcompileAtom (atom) {
  if (atom instanceof Variable)
    return atom.name;
  else
    return 'vec2(' + atom.real + ',' +  atom.imag + ')';
}

function GLSLcompileOperation (tree) {
  var oper1 = GLSLcompileTree(tree.a);
  var oper2 = GLSLcompileTree(tree.b);
  switch (tree.op){
  case '+':
    return '(' + oper1 + '+' + oper2 + ')';
  case '-':
    return '(' + oper1 + '-' + oper2 + ')';
  case '*':
    var x1 = '(' + oper1 + ').x';
    var y1 = '(' + oper1 + ').y';
    var x2 = '(' + oper2 + ').x';
    var y2 = '(' + oper2 + ').y';
    return 'vec2(' +
      (x1 + '*' + x2) + '-' + (y1 + '*' + y2) + ', ' + 
      (x1 + '*' + y2) + '+' + (x2 + '*' + y1) +
      ')';
  case '/':
    return;
  default:
    throw new Error("No implemented operation");
  }
}

function GLSLcompileTree (tree) {
  if (tree instanceof Operation)
    return GLSLcompileOperation(tree);
  else
    return GLSLcompileAtom(tree);
}

function GLSLcompile (string) {
  return GLSLcompileTree(parse(string));
}
