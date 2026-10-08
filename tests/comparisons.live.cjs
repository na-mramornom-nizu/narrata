// Explicit live regression: node --require ./tests/register.cjs tests/comparisons.live.cjs D:/ [http://localhost:3001]
const fs=require('node:fs');const path=require('node:path');const XLSX=require('xlsx');
const {parseFile,datasetFromText}=require('../lib/parse.ts');
const root=process.argv[2];if(!root)throw Error('Pass the directory containing the test datasets.');
const base=process.argv[3]||'http://localhost:3001';
const load=async name=>parseFile(new File([fs.readFileSync(path.join(root,name))],path.basename(name)));
const number=n=>n.toLocaleString('ru-RU',{maximumFractionDigits:2}).replace(/\s/g,'');
const count=(d,c,v)=>d.rows.filter(r=>r[c]===v).length;
(async()=>{
 const attractions=await load('Москва/data-3227-20-08-2026.csv'),plants=await load('Москва/data-60861-2025-09-05.csv'),star=await load('StarWars.csv'),titanic=await load('titanic.csv'),countries=await load('countries.csv');
 const a=count(attractions,'Район','Даниловский район'),b=count(attractions,'Район','Хорошёвский район');
 const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(attractions.rows),'Объекты');
 const excel=await parseFile(new File([XLSX.write(wb,{type:'buffer',bookType:'xlsx'})],'attractions.xlsx'));
 const text=datasetFromText('В Даниловском районе зарегистрированы 3 аттракциона. В Хорошёвском районе зарегистрированы 6 аттракционов.');
 const cases=[
 [attractions,'На сколько процентов аттракционов в Даниловском районе меньше, чем в Хорошёвском?',100*(b-a)/b],
 [attractions,'На сколько процентов в Хорошёвском районе больше аттракционов, чем в Даниловском?',100*(b-a)/a],
 [attractions,'На сколько процентов аттракционов в Даниловском районе меньше, чем в Хорошевском?',100*(b-a)/b],
 [attractions,'На сколько процентов в Хамовниках больше аттракционов, чем в Марьино?',100*(12-11)/11],
 [plants,'На сколько процентов записей в зоне Луг меньше, чем в зоне Прибрежный лес?',100*(31-28)/31],
 [star,'На сколько процентов мужчин меньше, чем женщин среди участников опроса?',100*(549-497)/549],
 [titanic,'На сколько процентов пассажиров-женщин меньше, чем пассажиров-мужчин?',100*(577-314)/577],
 [excel,'На сколько процентов аттракционов в Даниловском районе меньше, чем в Хорошёвском?',50],
 [text,'На сколько процентов аттракционов в Даниловском районе меньше, чем в Хорошёвском?',50],
 [countries,'Какое население у Албании?',null],
 [plants,'Сколько стоила закупка растений?',null],
 [attractions,'На сколько процентов аттракционов в Даниловском районе меньше, чем в Хорошёвском?',50],
 ];
 const operands=[[3,6],[6,3],[3,6],[12,11],[28,31],[497,549],[314,577],[3,6],[3,6],null,null,[3,6]];
 let failed=0,index=0;
 for(const [dataset,question,expected]of cases){const response=await fetch(base+'/api/chat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({dataset,messages:[{role:'user',content:question}]}),signal:AbortSignal.timeout(120000)});const result=await response.json();const answer=result.answer||result.error||'';const compact=answer.replace(/\s/g,'');const passed=response.ok&&(expected===null?answer==='В этом отчете нет такой информации':compact.includes(number(expected))&&!compact.includes('-'+number(expected))&&(/%|процент/.test(answer))&&!/нет такой информации|не удалось/i.test(answer));const pair=operands[index++];const semantic=pair===null||pair.every(n=>new RegExp('(?<![0-9])'+number(n)+'(?![0-9])').test(compact))&&answer.includes(pair[0]<pair[1]?'меньше':'больше');const verified=passed&&semantic;if(!verified)failed++;console.log(JSON.stringify({passed:verified,file:dataset.name,question,expected,answer}));}
 console.log(`${cases.length-failed}/${cases.length} passed`);process.exitCode=failed?1:0;
})().catch(e=>{console.error(e.message);process.exitCode=1;});
