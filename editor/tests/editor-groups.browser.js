// Run via Runtime.evaluate with awaitPromise in a fresh editor.html tab.
// Refuse to run in a working session; handles and writes below are in memory.
(async()=>{
 await window.localWorkspace?.ready;
 await window.localWorkspace?.dispose();
 if (tabs.length || editorGroups.length !== 1) throw Error('Use a fresh isolated editor tab');
 const errors=[];window.addEventListener('unhandledrejection',e=>errors.push(String(e.reason?.stack||e.reason)));window.addEventListener('error',e=>errors.push(e.message));
 const check=(ok,label)=>{if(!ok)throw Error(label)};
 // File handles are in memory; this never writes user files or preferences.
 const disk=new Map();const writes=[];
 const handle=name=>({name,isSameEntry:async o=>o.name===name,queryPermission:async()=> 'granted',
   getFile:async()=>({arrayBuffer:async()=>new TextEncoder().encode(disk.get(name)).buffer}),
   createWritable:async()=>({write:async bytes=>{disk.set(name,new TextDecoder().decode(bytes));writes.push(name)},close:async()=>{},abort:async()=>{}})});
 const open=async(name,text=name,preview=false)=>{if(!disk.has(name))disk.set(name,text);return installContent(new TextEncoder().encode(disk.get(name)),name,'',handle(name),preview)};
 await open('shared.js',Array.from({length:30},(_,i)=>'line '+i).join('\n'));
 for(let i=0;i<3;i++)findEditorGroup().splitButton.click();
 const ids=editorGroups.map(g=>g.id);
 // A group keeps its own selection when the same file is shown elsewhere.
 for(let i=0;i<ids.length;i++){switchEditorGroup(ids[i]);editor.setPosition({lineNumber:2+i*4,column:2});}
 for(let i=0;i<ids.length;i++){switchEditorGroup(ids[i]);check(editor.getPosition().lineNumber===2+i*4,'independent cursor '+i);}
 // Edits remain shared, and saving from a later group writes only that file.
 switchEditorGroup(ids[2]);editor.executeEdits('test',[{range:new monaco.Range(1,1,1,1),text:'//changed\n'}]);
 check(editorGroups.every(g=>g.editor.getValue().startsWith('//changed')),'shared edits');await saveFile();check(!activeTab.dirty,'shared save clears dirty');
 await open('third.js');editor.executeEdits('test',[{range:new monaco.Range(1,1,1,1),text:'updated '}]);await saveFile();
 check(disk.get('third.js')==='updated third.js'&&writes.join(',')==='shared.js,third.js','save correct file');
 // Dirty exclusive files require confirmation when their group closes.
 editor.executeEdits('test',[{range:new monaco.Range(1,1,1,1),text:'dirty '}]);
 let confirms=0;window.confirm=()=>{confirms++;return false};
 closeEditorGroup(ids[2]);check(editorGroups.length===4&&confirms===1,'cancel dirty close');
 window.confirm=()=>true;closeEditorGroup(ids[2]);check(editorGroups.length===3&&!tabs.some(t=>t.name==='third.js'),'discard exclusive dirty file only');
 check(tabs.find(t=>t.name==='shared.js').groups.size===3,'shared file retained');
 // Menu actions stay within the originating group, including groups after the second.
 const last=editorGroups.at(-1);switchEditorGroup(last.id);await open('only-last.js');last.moreButton.click();
 check(activeGroup===last.id&&!editorMoreMenu.hidden,'last-group menu');document.querySelector('#editor-close-all').click();
 check(!last.editor.getModel()&&tabs.some(t=>t.name==='shared.js'),'close all only in source group');
 check(!last.header.hidden&&last.placeholder.hidden===false,'empty group remains usable');
 // Preview replaces only the active group's temporary file.
 await open('preview-one.js','one',true);await open('preview-two.js','two',true);
 check(!tabs.some(t=>t.name==='preview-one.js')&&last.editor.getValue()==='two','preview replacement');
 check(editorGroups[0].editor.getValue().startsWith('//changed'),'other group intact');
 applyWrap(true);check(editorGroups.every(g=>g.editor.getRawOptions().wordWrap==='on'),'wrap all groups');
 applyIndentSettings({insertSpaces:true,tabSize:3});check(tabs.every(t=>t.model.getOptions().tabSize===3),'indent all files');
 applyLanguage('en');check(editorGroups.every(g=>g.splitButton.title==='Split editor right'),'all group labels');
 await new Promise(r=>setTimeout(r,350));check(errors.length===0,'no runtime errors '+errors.join('\n'));
 return JSON.stringify({passed:true,groups:editorGroups.length,writes,errors});
})()
