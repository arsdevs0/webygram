import test from 'node:test';
import assert from 'node:assert/strict';
import { scrollToEnd } from '../src/utils/scrollToEnd.ts';
test('layout correction overrides CSS smooth scrolling and restores the preference',()=>{
 let used='';const element={style:{scrollBehavior:'smooth'},scrollHeight:3000,set scrollTop(value:number){assert.equal(value,3000);used=this.style.scrollBehavior;},scrollTo(){throw Error('Legacy instant behavior was used');}};
 scrollToEnd(element as unknown as HTMLElement);assert.equal(used,'auto');assert.equal(element.style.scrollBehavior,'smooth');
});
