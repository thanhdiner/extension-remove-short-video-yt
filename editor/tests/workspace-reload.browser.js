// Second phase of workspace.browser.js, after reloading the same isolated tab.
(async()=>{
 await localWorkspace.ready;const expected=JSON.parse(sessionStorage.getItem('workspace-regression'));const assert=(ok,label)=>{if(!ok)throw Error(label)};
 assert(localWorkspace.current.id===expected.idA,'reload selected workspace');assert(editorGroups.length===3&&explorerFolders.length===2,'reload layout and roots');
 assert(editor.getValue().startsWith('// UNSAVED DRAFT')&&state.dirty,'reload draft');assert(indentSettings.tabSize===3&&elements.wrap.checked,'reload scoped settings');
 const record=await localWorkspace.store.get(expected.idB);assert(record.name==='Workspace B','other workspace retained');
 const opfs=await navigator.storage.getDirectory();await opfs.removeEntry(expected.fixtureName,{recursive:true});sessionStorage.removeItem('workspace-regression');
 return JSON.stringify({passed:true,reloaded:true,groups:editorGroups.length,roots:explorerFolders.length,dirty:state.dirty});
})()
