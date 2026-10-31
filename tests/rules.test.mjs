import test from 'node:test';
import assert from 'node:assert/strict';
import {DEFAULT_RULE,qualifies,validateRule,vietnamDate,parseRows} from '../lib/rules.mjs';
const row={id:'1880294716548322',enabled:true,statusKnown:true,roi:4.8,spend:53658};
test('ROI below 5 qualifies; ROI equal to 5 is preserved',()=>{
 assert.equal(qualifies(row,DEFAULT_RULE),true);
 assert.equal(qualifies({...row,roi:5},DEFAULT_RULE),false);
 assert.equal(qualifies({...row,roi:5.01},DEFAULT_RULE),false);
});
test('zero spend is skipped by default but can explicitly qualify',()=>{
 assert.equal(qualifies({...row,roi:0,spend:0},DEFAULT_RULE),false);
 assert.equal(qualifies({...row,roi:0,spend:0},{...DEFAULT_RULE,skipZero:false}),true);
});
test('unknown metrics and already disabled campaigns never qualify',()=>{
 for(const patch of [{roi:null},{roi:NaN},{spend:null},{spend:NaN},{enabled:false},{statusKnown:false},{roi:-1}]) assert.equal(qualifies({...row,...patch},DEFAULT_RULE),false);
});
test('minimum spend is inclusive',()=>{
 assert.equal(qualifies(row,{...DEFAULT_RULE,minSpend:53658}),true);
 assert.equal(qualifies(row,{...DEFAULT_RULE,minSpend:53659}),false);
});
test('date rolls over at midnight in Vietnam, independent of server timezone',()=>{
 assert.equal(vietnamDate(new Date('2026-10-31T16:59:59Z')),'2026-10-31');
 assert.equal(vietnamDate(new Date('2026-10-31T17:00:00Z')),'2026-11-01');
});
test('invalid rules are rejected',()=>{
 for(const patch of [{threshold:0},{threshold:NaN},{threshold:'5'},{minSpend:-1},{skipZero:'false'},{intervalMinutes:0},{intervalMinutes:1.5}]) assert.throws(()=>validateRule({...DEFAULT_RULE,...patch}));
});
test('ROI metric is actual ROI, never target ROI; IDs retain precision',()=>{
 const table=[[{name:'campaign_id',data:'7494773876655295231'},{name:'campaign_name',data:'Sample'},{name:'campaign_opt_status',data:'0'},{name:'stats_total_cost',data:'53658'},{name:'onsite_roi2_total_cost_shopping',data:'4.80'},{name:'template_ad_roas_bid',data:'9.90'}]];
 const parsed=parseRows(table)[0];assert.equal(parsed.id,'7494773876655295231');assert.equal(parsed.roi,4.8);assert.equal(parsed.targetRoi,9.9);assert.equal(parsed.enabled,true);
 const missing=parseRows([[{name:'campaign_id',data:'1234'},{name:'template_ad_roas_bid',data:'4.8'}]])[0];assert.equal(missing.roi,null);assert.equal(missing.statusKnown,false);
});
