const moves = ["None", "Quick March", "Right Turn", "Left Turn", "About Turn", "Right Wheel", "Left Wheel", "Open Order", "Close Order"];
let squad = [], isRunning = false, isOpened = false;
let visualFacing = 0, structuralFront = 0, animMs = 600;
let currentPivotGate = null;

function updateTempo(val) {
    const speedDisplay = document.getElementById('speed-val');
    if(speedDisplay) speedDisplay.innerText = parseFloat(val).toFixed(1) + 'x';
    animMs = 600 / val;
    document.documentElement.style.setProperty('--anim-speed', animMs + 'ms');
}

function createRow(i, val = "None", p = 1) {
    const div = document.createElement('div'); div.className = 'move-item';
    const showPace = val.includes('Mar') || val.includes('Wheel');
    div.innerHTML = `<b>${i}</b>
        <select class="m-type" onchange="addNext(${i}); toggleP(this)">
            ${moves.map(m => `<option ${m === val ? 'selected' : ''}>${m}</option>`).join('')}
        </select>
        <input type="number" class="m-pace" value="${p}" min="1" style="width:40px; ${showPace ? '' : 'display:none'}">
        <button class="del-btn" onclick="this.parentElement.remove()">✕</button>`;
    return div;
}

function addNext(i) {
    const list = document.getElementById('move-list');
    if (i === list.children.length) list.appendChild(createRow(i + 1));
}

function toggleP(s) {
    s.nextElementSibling.style.display = (s.value.includes('March') || s.value.includes('Wheel')) ? 'inline-block' : 'none';
}

function initSim() {
    isRunning = false; isOpened = false; currentPivotGate = null;
    visualFacing = 0; 
    structuralFront = 0; 

    const count = parseInt(document.getElementById('count').value);
    const floor = document.getElementById('grid-floor');
    floor.innerHTML = ''; squad = []; 
    const rows = 3, cols = Math.ceil(count / rows);
    const elementClass = document.getElementById('element').value;
    const anchorX = 1000, anchorY = 1000;

    if (document.getElementById('showCmdr').checked) {
        const cmdrX = anchorX + ((cols - 1) * 40) / 2; 
        const cmdrY = anchorY - 80; 
        squad.push(spawn(cmdrX, cmdrY, 'C', 'commander', -1, -1));
    }
    
    let id = 1;
    for (let r = 0; r < rows; r++) {
        for (let c = cols - 1; c >= 0; c--) {
            if(id <= count) squad.push(spawn(anchorX + (c * 40), anchorY + (r * 40), id++, elementClass, r, c));
        }
    }
    updateVisuals();
    updateModeDisplay();
}

function spawn(x, y, txt, cls, rIdx, fIdx) {
    const div = document.createElement('div'); div.className = 'member';
    div.innerHTML = `<div class="circle ${cls}">${txt}</div>`;
    document.getElementById('grid-floor').appendChild(div);
    return { el: div, x, y, rIdx, fIdx, localFacing: 0, turning: false, stepsDone: 0 };
}

function detectMode() {
    const diff = Math.abs(visualFacing - structuralFront) % 180;
    return (diff < 5 || Math.abs(diff - 180) < 5) ? "LINE" : "COLUMN";
}

function updateModeDisplay() {
    const mode = detectMode();
    const display = document.getElementById('mode-display');
    if (display) {
        display.innerText = "Mode: In " + (mode === "LINE" ? "Line" : "Column");
        display.style.color = (mode === "LINE") ? "#2ecc71" : "#3498db";
    }
}

function getPivot(isR) {
    const drillSquad = squad.filter(s => s.rIdx !== -1);
    const rad = (visualFacing * Math.PI) / 180;
    const forwardVec = { x: Math.sin(rad), y: -Math.cos(rad) };
    const rightVec = { x: Math.cos(rad), y: Math.sin(rad) };

    let maxSide = -Infinity, minSide = Infinity;
    drillSquad.forEach(s => {
        const sideScore = s.x * rightVec.x + s.y * rightVec.y;
        if (sideScore > maxSide) maxSide = sideScore;
        if (sideScore < minSide) minSide = sideScore;
    });

    const flankers = drillSquad.filter(s => {
        const sideScore = s.x * rightVec.x + s.y * rightVec.y;
        return isR ? Math.abs(sideScore - maxSide) < 5 : Math.abs(sideScore - minSide) < 5;
    });

    return flankers.reduce((best, curr) => {
        const bestF = best.x * forwardVec.x + best.y * forwardVec.y;
        const currF = curr.x * forwardVec.x + curr.y * forwardVec.y;
        return (currF > bestF) ? curr : best;
    });
}

async function runSequence() {
    if (isRunning) return; isRunning = true;
    const items = document.querySelectorAll('.move-item');

    for (let it of items) {
        if (!isRunning) break;
        const m = it.querySelector('.m-type').value, p = parseInt(it.querySelector('.m-pace').value);
        if (m === "None") continue;
        it.classList.add('active');
        
        currentPivotGate = null;
        squad.forEach(s => { 
            s.turning = false; 
            s.stepsDone = 0; 
            // Lock localFacing to current visualFacing before move starts
            s.localFacing = visualFacing; 
        });
        updateModeDisplay();

        if (m.includes("Wheel")) {
            const isR = m.includes("Right");
            const pvt = getPivot(isR);
            currentPivotGate = { 
                x: pvt.x, y: pvt.y, isR, 
                startFacing: visualFacing,
                targetFacing: visualFacing + (isR ? 90 : -90) 
            };
        }

        let moveComplete = false, stepCount = 0;
        const totalSteps = m.includes('March') ? p : 1;

        while (!moveComplete && isRunning) {
            const result = await execute(m, totalSteps);
            stepCount++;
            moveComplete = m.includes("Wheel") ? result.allDone : stepCount >= totalSteps;
            await new Promise(r => setTimeout(r, animMs));
        }
        
        updateModeDisplay();
        it.classList.remove('active');
        
        // Final normalization after move is fully completed
        visualFacing = ((visualFacing % 360) + 360) % 360;
        squad.forEach(s => { 
            s.turning = false; 
            s.stepsDone = 0; 
            s.localFacing = visualFacing; 
        });
        currentPivotGate = null;
    }
    isRunning = false;
    updateVisuals();
}

function execute(type, totalPaces) {
    return new Promise(resolve => {
        let allDone = true; 
        const mode = detectMode();

        if (type.includes("Turn")) {
            // Incremental change to avoid winding spin
            const change = (type.includes("Right") ? 90 : (type.includes("About") ? 180 : -90));
            visualFacing += change;
            squad.forEach(s => s.localFacing = visualFacing);
        } else if (type === "Quick March") {
            const r = (visualFacing * Math.PI) / 180;
            const dx = Math.round(Math.sin(r)) * 40, dy = -Math.round(Math.cos(r)) * 40;
            squad.forEach(s => { s.x += dx; s.y += dy; });
        } else if (type.includes("Wheel")) {
            const drillMembers = squad.filter(s => s.rIdx !== -1);
            const maxFIdx = Math.max(...drillMembers.map(s => s.fIdx));
            const wheelPaces = mode === "COLUMN" ? 4 : Math.max(4, 4 + (maxFIdx + 1 - 3));
            
            const lockedStart = currentPivotGate.startFacing;
            const lockedEnd = currentPivotGate.targetFacing;
            const stepAngle = (currentPivotGate.isR ? 90 : -90) / wheelPaces;
            const rad = (stepAngle * Math.PI) / 180;
                
            squad.forEach(s => {
                if (s.rIdx === -1) return;
                if (mode === "LINE") {
                    s.turning = true; 
                } else {
                    const dist = Math.sqrt(Math.pow(s.x - currentPivotGate.x, 2) + Math.pow(s.y - currentPivotGate.y, 2));
                    if (!s.turning && s.stepsDone === 0 && dist < 20) {
                        squad.filter(m => m.fIdx === s.fIdx).forEach(m => m.turning = true);
                    }
                }
            });
        
            squad.forEach(s => {
                const isCmdr = s.rIdx === -1;
                if (isCmdr && s.stepsDone === 0 && squad.some(m => m.turning)) s.turning = true;
            
                if (s.turning && s.stepsDone < wheelPaces) {
                    const tx = s.x - currentPivotGate.x;
                    const ty = s.y - currentPivotGate.y;
                    
                    s.x = Math.round(currentPivotGate.x + (tx * Math.cos(rad) - ty * Math.sin(rad)));
                    s.y = Math.round(currentPivotGate.y + (tx * Math.sin(rad) + ty * Math.cos(rad)));
                    
                    s.stepsDone++;
                    // Use cumulative facing during the move to prevent spin
                    s.localFacing = lockedStart + (stepAngle * s.stepsDone);
                    allDone = false;
                } 
                else if (s.stepsDone >= wheelPaces) {
                    const r = (lockedEnd * Math.PI) / 180;
                    s.x += Math.round(Math.sin(r)) * 40;
                    s.y += -Math.round(Math.cos(r)) * 40;
                    s.localFacing = lockedEnd;
                } 
                else {
                    const r = (lockedStart * Math.PI) / 180;
                    s.x += Math.round(Math.sin(r)) * 40;
                    s.y += -Math.round(Math.cos(r)) * 40;
                    s.localFacing = lockedStart;
                    allDone = false;
                }
            });

            if (allDone) {
                visualFacing = lockedEnd;
            }
        } else if (type.includes("Order")) {
            const isOpenCmd = type.includes("Open");
            if (isOpenCmd !== isOpened) {
                isOpened = isOpenCmd;
                const r = (structuralFront * Math.PI) / 180;
                const dx = Math.round(Math.sin(r)) * 120 * (isOpened ? 1 : -1), dy = -Math.round(Math.cos(r)) * 120 * (isOpened ? 1 : -1);
                squad.forEach(s => {
                    if (s.rIdx === 0 || s.rIdx === -1) { s.x += dx; s.y += dy; }
                    else if (s.rIdx === 2) { s.x -= dx; s.y -= dy; }
                });
            }
        }
        updateVisuals(); resolve({ allDone });
    });
}

function updateVisuals() {
    squad.forEach(m => {
        m.el.style.left = m.x + 'px'; m.el.style.top = m.y + 'px';
        m.el.style.transform = `rotate(${m.localFacing}deg)`;
        if(currentPivotGate && Math.abs(m.x - currentPivotGate.x) < 5 && Math.abs(m.y - currentPivotGate.y) < 5) m.el.classList.add('is-pivot');
        else m.el.classList.remove('is-pivot');
    });
}

function clearRoutine() { document.getElementById('move-list').innerHTML = ''; for (let i = 1; i <= 5; i++) document.getElementById('move-list').appendChild(createRow(i)); initSim(); }
function stopSequence() { isRunning = false; }
function saveRoutine() {
    const data = { s: { c: document.getElementById('count').value, e: document.getElementById('element').value, m: document.getElementById('showCmdr').checked }, r: Array.from(document.querySelectorAll('.move-item')).map(it => ({ m: it.querySelector('.m-type').value, p: it.querySelector('.m-pace').value })).filter(x => x.m !== "None") };
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(data)], { type: 'application/json' })); a.download = 'drill.json'; a.click();
}
function loadRoutine(e) {
    const reader = new FileReader(); reader.onload = (ev) => {
        const data = JSON.parse(ev.target.result);
        document.getElementById('count').value = data.s.c; document.getElementById('element').value = data.s.e; document.getElementById('showCmdr').checked = data.s.m;
        initSim();
        const list = document.getElementById('move-list'); list.innerHTML = '';
        data.r.forEach((step, i) => { list.appendChild(createRow(i + 1, step.m, step.p)); addNext(i + 1); });
    }; reader.readAsText(e.target.files[0]);
}

for (let i = 1; i <= 5; i++) document.getElementById('move-list').appendChild(createRow(i));
initSim();