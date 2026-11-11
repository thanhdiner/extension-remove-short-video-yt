// Run in a fresh editor.html?workspaceTest=<unique-id> tab, then reload
// and run workspace-reload.browser.js. Only OPFS test files are written.
(async()=>{
 if (!new URLSearchParams(location.search).get('workspaceTest')) throw Error('Use an isolated workspaceTest tab');
 await localWorkspace.ready;
 const errors=[];window.addEventListener('unhandledrejection',e=>errors.push(String(e.reason?.stack||e.reason)));window.addEventListener('error',e=>errors.push(e.message));
 const assert=(value,message)=>{if(!value)throw Error(message)};
 const originalGlobalSettings=await chrome.storage.local.get([WRAP_KEY,AUTOSAVE_KEY,INDENT_KEY,MULTI_TAB_KEY,PREVIEW_KEY]);
 const opfs=await navigator.storage.getDirectory();const fixtureName='codex-workspace-'+crypto.randomUUID();const fixture=await opfs.getDirectoryHandle(fixtureName,{create:true});
 const front=await fixture.getDirectoryHandle('frontend',{create:true}),back=await fixture.getDirectoryHandle('backend',{create:true});
 const frontFile=await front.getFileHandle('same.js',{create:true}),backFile=await back.getFileHandle('same.js',{create:true});
 async function write(handle,text){const writer=await handle.createWritable();await writer.write(text);await writer.close()}
 async function open(handle){const f=await handle.getFile();await installContent(new Uint8Array(await f.arrayBuffer()),handle.name,'',handle)}
 await write(frontFile,'// frontend\nconst value = 1;');await write(backFile,'// backend\nconst value = 2;');
 await localWorkspace.rename('Workspace A');const idA=localWorkspace.current.id;
 await setExplorerFolders([{handle:front,absolutePath:'C:\\fixture\\frontend'},{handle:back,absolutePath:'C:\\fixture\\backend'}]);
 await open(frontFile);findEditorGroup().splitButton.click();await open(backFile);findEditorGroup().splitButton.click();
 assert(editorGroups.length===3,'three groups');
 // Settings are workspace-scoped and must not write the global settings keys.
 elements.autosave.checked=false;elements.autosave.dispatchEvent(new Event('change'));
 elements.wrap.checked=true;elements.wrap.dispatchEvent(new Event('change'));
 applyIndentSettings({insertSpaces:true,tabSize:3});await persistEditorSetting(INDENT_KEY,indentSettings);
 await new Promise(r=>setTimeout(r,80));
 const nodes=[...document.querySelectorAll('.tree-item')];const frontNode=nodes.find(n=>n.title==='frontend\\same.js'),backNode=nodes.find(n=>n.title==='backend\\same.js');
 assert(frontNode&&backNode,'two root folder trees');
 backNode.dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true,clientX:300,clientY:150}));
 assert(treeContext.relativePath==='same.js'&&treeContext.rootDescriptor.handle.name==='backend','second-root context');hideTreeMenu();
 switchEditorGroup(editorGroups[0].id);editor.executeEdits('test',[{range:new monaco.Range(1,1,1,1),text:'// UNSAVED DRAFT\n'}]);editor.setPosition({lineNumber:2,column:4});
 const idsA=editorGroups.map(g=>g.id);const activeA=activeGroup;
 await localWorkspace.saveNow();
 const record=await localWorkspace.store.get(idA);
 assert(record.folders.length===2&&record.groups.length===3&&record.documents[0].text.startsWith('// UNSAVED'),'persist draft and layout');
 const idB=await localWorkspace.create('Workspace B');
 assert(tabs.length===0&&editorGroups.length===1&&explorerFolders.length===0,'new blank workspace');
 await setExplorerFolders([{handle:back}]);await open(backFile);
 elements.autosave.checked=false;elements.autosave.dispatchEvent(new Event('change'));
 elements.wrap.checked=false;elements.wrap.dispatchEvent(new Event('change'));
 applyIndentSettings({insertSpaces:false,tabSize:7});await persistEditorSetting(INDENT_KEY,indentSettings);await localWorkspace.saveNow();
 await localWorkspace.open(idA);
 assert(explorerFolders.length===2&&editorGroups.length===3&&activeGroup===activeA,'restore roots and active group');
 assert(editor.getValue().startsWith('// UNSAVED DRAFT')&&state.dirty,'restore dirty draft');
 assert(editor.getPosition().lineNumber===2&&editor.getPosition().column===4,'restore cursor');
 assert(elements.wrap.checked&&indentSettings.tabSize===3&&!elements.autosave.checked,'restore workspace settings A');
 assert(!document.querySelector('#workspace-menu-btn').disabled,'workspace menu usable after switch');
 const diskBefore=await (await frontFile.getFile()).text();assert(!diskBefore.includes('UNSAVED'),'draft never writes disk');
 // External edits refresh clean documents; a dirty draft retains its original baseline.
 await write(backFile,'// changed externally');await localWorkspace.refreshFolderFiles(back);
 assert(editorGroups[1].editor.getValue()==='// changed externally','refresh clean file after reconnect');
 await localWorkspace.open(idB);
 assert(editor.getValue()==='// changed externally'&&!state.dirty,'refresh clean disk contents');
 assert(indentSettings.tabSize===7&&!elements.wrap.checked,'restore workspace B settings');
 await localWorkspace.open(idA);assert(state.dirty&&editor.getValue().startsWith('// UNSAVED'),'dirty draft survives repeated switches');
 assert(editorGroups[1].editor.getValue()==='// changed externally','clean shared disk file refreshed');
 // Refusing a save with a stale disk baseline protects external changes.
 await write(frontFile,'// EXTERNAL FRONT');await saveFile();
 assert((await (await frontFile.getFile()).text())==='// EXTERNAL FRONT'&&state.dirty,'protect external disk changes');clearError();
 const globalsAfter=await chrome.storage.local.get([WRAP_KEY,AUTOSAVE_KEY,INDENT_KEY,MULTI_TAB_KEY,PREVIEW_KEY]);
 assert(JSON.stringify(globalsAfter)===JSON.stringify(originalGlobalSettings),'global preferences unchanged');
 await localWorkspace.saveNow();
 // An unsuccessful backup must stop a workspace switch before disposing models.
 const originalSave=localWorkspace.store.save;
 localWorkspace.store.save=async()=>{throw Error('simulated storage failure')};
 let blocked=false;try{await localWorkspace.create('Must not replace A')}catch{blocked=true}finally{localWorkspace.store.save=originalSave}
 assert(blocked&&localWorkspace.current.id===idA&&editor.getValue().startsWith('// UNSAVED'),'failed backup preserves working session');
 await localWorkspace.saveNow();
 const latest=await localWorkspace.store.get(idA);let conflict=false;
 try{await localWorkspace.store.save(latest,latest.revision-1)}catch{conflict=true}
 assert(conflict,'reject stale writes from another tab');
 sessionStorage.setItem('workspace-regression',JSON.stringify({idA,idB,fixtureName,idsA,activeA,globalSettings:originalGlobalSettings}));
 assert(errors.length===0,'runtime errors: '+errors.join('\n'));
 return JSON.stringify({passed:true,workspace:idA,roots:explorerFolders.length,groups:editorGroups.length,draft:state.dirty,errors});
})()
