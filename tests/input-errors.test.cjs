const {test}=require('node:test');
const assert=require('node:assert/strict');
const {parseCSV,parseFile,FileInputError}=require('../lib/parse.ts');
const {serviceError}=require('../lib/errors.ts');

test('CSV reads semicolons, translated metadata headers, trailing delimiters and multiline fields',()=>{
 const d=parseCSV('"ID";"Name";"Description";\n"Код";"Название";"Описание";\n"1";"Ель";"Первая строка\nвторая строка";','trees.csv');
 assert.equal(d.rows.length,1);
 assert.deepEqual(d.columns,['Код','Название','Описание']);
 assert.equal(d.rows[0].Описание,'Первая строка\nвторая строка');
});
test('survey headers retain distinct question groups and exclude labels from respondents',()=>{
 const d=parseCSV('RespondentID,Seen?,Rank,,Liked,\n,Response,Film A,Film B,A,B\n1,Yes,1,2,Yes,No','survey.csv');
 assert.equal(d.rows.length,1);
 assert.ok(d.columns.includes('Rank — Film A'));
 assert.ok(d.columns.includes('Liked — A'));
});
test('empty and broken inputs produce actionable file errors',async()=>{
 assert.throws(()=>parseCSV('A,B\n','empty.csv'),FileInputError);
 assert.throws(()=>parseCSV('A,B\n"broken,2','broken.csv'),/кавычки/);
 assert.throws(()=>parseCSV('A,B\n1,2,3','broken.csv'),/количество ячеек/);
 await assert.rejects(()=>parseFile(new File([],'empty.csv')),/нет записей/);
 await assert.rejects(()=>parseFile(new File([new Uint8Array([0,1,2])],'binary.csv')),/не похож/);
});
test('legacy Western encoding is decoded without replacement characters',async()=>{
 const d=await parseFile(new File([new Uint8Array([78,97,109,101,10,67,97,102,233])],'legacy.csv'));
 assert.equal(d.rows[0].Name,'Café');
});
test('service failures never expose upstream debug text',()=>{
 for(const message of ['GigaChat HTTP 401: secret','Failed to parse JSON from model output','socket stack trace','timeout']){
  const result=serviceError(new Error(message),'analysis');
  assert.ok(result.status>=500);
  assert.doesNotMatch(result.error,/GigaChat|JSON|secret|stack|сломалось/);
 }
});
