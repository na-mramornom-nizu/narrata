const {test}=require('node:test');
const assert=require('node:assert/strict');
const {planTableQuery,executeTableQuery}=require('../lib/table-query.ts');
const {tableContext}=require('../lib/table.ts');
const dataset={name:'objects.csv',source:'file',columns:['Name','District','Description'],rows:Array.from({length:23},(_,i)=>({Name:`Object ${i}`,District:i<12?'Хамовники':'Марьино',Description:'long text '.repeat(500)}))};
const plan=(subjects)=>planTableQuery({kind:'count_difference',subjectColumn:'District',subjects},dataset);
test('group count difference counts every row and preserves direction',()=>{
 assert.match(executeTableQuery(dataset,plan(['Хамовники','Марьино'])),/больше .* на 1: 12 против 11/);
 assert.match(executeTableQuery(dataset,plan(['Марьино','Хамовники'])),/меньше .* на 1: 11 против 12/);
});
test('missing groups and extra filters cannot silently produce a comparison',()=>{
 assert.throws(()=>plan(['Хамовники','Нет такого района']));
 assert.throws(()=>planTableQuery({kind:'count_difference',subjectColumn:'District',subjects:['Хамовники','Марьино'],filterColumn:'Name',filterOperator:'eq',filterValue:'Object 0'},dataset));
});
test('category catalogue includes groups beyond truncated records',()=>{
 const context=JSON.parse(tableContext(dataset));
 assert.equal(context.recordsComplete,false);
 assert.deepEqual(context.columns.find(c=>c.name==='District').values,['Хамовники','Марьино']);
});
test('equal group counts report equality',()=>{
 const d={...dataset,rows:dataset.rows.slice(1)};
 assert.match(executeTableQuery(d,planTableQuery({kind:'count_difference',subjectColumn:'District',subjects:['Хамовники','Марьино']},d)),/равно .*по 11/);
});
test('count alias resolves unambiguous shortened group names',()=>{
 const d={...dataset,rows:dataset.rows.map(row=>({...row,District:'район '+row.District}))};
 const q=planTableQuery({kind:'difference',metric:'count',subjectColumn:'District',subjects:['Хамовники','Марьино']},d);
 assert.equal(q.kind,'count_difference');
 assert.match(executeTableQuery(d,q),/на 1: 12 против 11/);
 const ambiguous={...d,rows:[...d.rows,{Name:'extra',District:'другой район Хамовники',Description:''}]};
 assert.throws(()=>planTableQuery({kind:'count_difference',subjectColumn:'District',subjects:['Хамовники','Марьино']},ambiguous));
});
