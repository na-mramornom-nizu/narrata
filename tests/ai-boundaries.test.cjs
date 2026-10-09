const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const ts=require('typescript');

test('AI workflows reference prompts without inline system instructions',()=>{
  for(const file of fs.readdirSync(path.join(__dirname,'../lib/ai')).filter(name=>name.endsWith('.ts'))){
    const source=ts.createSourceFile(file,fs.readFileSync(path.join(__dirname,'../lib/ai',file),'utf8'),ts.ScriptTarget.Latest,true);
    function visit(node){
      if(ts.isObjectLiteralExpression(node)&&node.properties.some(p=>p.name?.getText(source)==='role'&&p.initializer?.text==='system')){
        const content=node.properties.find(p=>p.name?.getText(source)==='content')?.initializer;
        assert.ok(content,`${file}: system message needs content`);
        assert.ok(ts.isIdentifier(content)||ts.isCallExpression(content),`${file}: move system instructions to lib/prompts`);
      }
      ts.forEachChild(node,visit);
    }
    visit(source);
  }
});

test('prompt modules format instructions without transport or calculation dependencies',()=>{
  for(const file of fs.readdirSync(path.join(__dirname,'../lib/prompts')).filter(name=>name.endsWith('.ts'))){
    const source=ts.createSourceFile(file,fs.readFileSync(path.join(__dirname,'../lib/prompts',file),'utf8'),ts.ScriptTarget.Latest,true);
    for(const statement of source.statements){
      if(ts.isImportDeclaration(statement))assert.match(statement.moduleSpecifier.text,/^\.\/[^/]+$/,`${file}: prompts may only import other prompt modules`);
    }
  }
});
