export const expenseCategories=['餐饮','交通','购物','学习','住宿','娱乐','其他'];
export function bulkExpenseCategory(state,targets,category){
 if(!expenseCategories.includes(category))throw Error('请选择有效的消费分类');
 if(!targets.length)throw Error('请先选择支出记录');
 const byId=new Map(targets.map(t=>[t.id,t]));
 if(byId.size!==targets.length)throw Error('选择中存在重复记录');
 const current=new Map(state.transactions.map(t=>[t.id,t]));
 for(const target of targets){const t=current.get(target.id);if(!t||t.type!=='expense'||t.category!==target.category)throw Error('选中的记录已在其他窗口或设备更新，请重新核对后选择');}
 const changed=targets.filter(t=>t.category!==category);
 const next={...state,transactions:state.transactions.map(t=>byId.has(t.id)?{...t,category}:t)};
 return {state:next,count:changed.length,undo:changed.map(t=>({id:t.id,before:t.category,after:category}))};
}
export function undoExpenseCategory(state,changes){
 const byId=new Map(changes.map(t=>[t.id,t]));
 for(const c of changes){const t=state.transactions.find(t=>t.id===c.id);if(!t||t.type!=='expense'||t.category!==c.after)throw Error('记录已发生后续修改，不能直接撤销，请重新核对');}
 return {...state,transactions:state.transactions.map(t=>byId.has(t.id)?{...t,category:byId.get(t.id).before}:t)};
}
