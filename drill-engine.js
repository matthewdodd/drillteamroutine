const moves = ["None", "Quick March", "Right Turn", "Left Turn", "About Turn", "Right Wheel", "Left Wheel", "Open Order", "Close Order"];
let squad = [], isRunning = false, isOpened = false;
let visualFacing = 0, structuralFront = 0, animMs = 600;
let currentPivotGate = null;

function updateTempo(val) {
    document.getElementById('speed-val').innerText = val + 'x';
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
    const count = parseInt(document.getElementById('count').value);
    const floor = document.getElementById('grid-floor');
    floor.innerHTML = ''; squad = []; visualFacing = 0; structuralFront = 0;
    
    const rows = 3, cols = Math.ceil(count / rows);
    
    if (document.getElementById('showCmdr').checked) {
        squad.push(spawn(1000 + (cols * 20) - 20, 920, 'C', 'commander', -1, -1));
    }
    
    let id = 1;
    for (let r = 0; r < rows; r++) {
        for (let c = cols - 1; c >= 0; c--) {
            if(id <= count) squad.push(spawn(1000 + (c * 40), 1000 + (r * 40), id++, document.getElementById('element').value, r, c));
        }
    }
    updateVisuals();
}

function spawn(x, y, txt, cls, rIdx, fIdx) {
    const div = document.createElement('div'); div.className = 'member';
    div.innerHTML = `<div class="circle ${cls}">${txt}</div>`;
    document.getElementById('grid-floor').appendChild(div);
    return { el: div, x, y, rIdx, fIdx, localFacing: 0, turning: false, stepsDone: 0 };
}

function detectMode() {
    return (Math.abs(visualFacing - structuralFront) % 180 === 0) ? "LINE" : "COLUMN";
}

function getPivot(isR) {
    const mode = detectMode();
    const drillSquad = squad.filter(s => s.rIdx !== -1);
    let candidates = mode === "LINE" ? drillSquad.filter(s => s.rIdx === 0) : drillSquad.filter(s => s.fIdx === (isR ? Math.max(...drillSquad.map(f => f.fIdx)) : 0));
    
    const rad = (visualFacing * Math.PI) / 180;
    const fx = Math.sin(rad + Math.PI/2), fy = -Math.cos(rad + Math.PI/2);
    
    return candidates.reduce((p, c) => {
        const pV = p.x * fx + p.y * fy, cV = c.x * fx + c.y * fy;
        return (isR ? cV > pV : cV < pV) ? c : p;
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
        
        if (m.includes("Wheel")) {
            const isR = m.includes("Right");
            const pvt = getPivot(isR);
            currentPivotGate = { x: pvt.x, y: pvt.y, isR, targetFacing: visualFacing + (isR ? 90 : -90) };
        }

        const totalSteps = (m.includes('Mar') || m.includes('Wheel')) ? p : 1;
        for (let step = 0; step < totalSteps; step++) {
            if (!isRunning) break;
            await execute(m, totalSteps);
            await new Promise(r => setTimeout(r, animMs));
        }
        
        it.classList.remove('active');
        currentPivotGate = null;
        squad.forEach(s => { s.turning = false; s.stepsDone = 0; s.localFacing = visualFacing; });
        document.getElementById('mode-display').innerText = "Mode: In " + (detectMode() === "LINE" ? "Line" : "Column");
    }
    isRunning = false;
    updateVisuals();
}

function execute(type, totalPaces) {
    return new Promise(resolve => {
        if (type.includes("Turn")) {
            visualFacing += (type.includes("Right") ? 90 : (type.includes("About") ? 180 : -90));
            squad.forEach(s => s.localFacing = visualFacing);
        } else if (type === "Quick March") {
            const r = (visualFacing * Math.PI) / 180;
            const dx = Math.round(Math.sin(r)) * 40, dy = -Math.round(Math.cos(r)) * 40;
            squad.forEach(s => { s.x += dx; s.y += dy; });
        } else if (type.includes("Wheel")) {
            const mode = detectMode();
            const N = mode === "LINE" ? (Math.max(...squad.map(s => s.fIdx)) + 1) : 3;
            const wheelPaces = Math.max(4, 4 + (N - 3));
            const stepAngle = (currentPivotGate.isR ? 90 : -90) / wheelPaces;
            const rad = (stepAngle * Math.PI) / 180;

            squad.forEach(s => {
                const dist = Math.sqrt(Math.pow(s.x - currentPivotGate.x, 2) + Math.pow(s.y - currentPivotGate.y, 2));
                const isLead = (mode === "LINE" ? s.rIdx === 0 : s.fIdx === (currentPivotGate.isR ? Math.max(...squad.map(f => f.fIdx)) : 0));

                if (isLead || s.turning || dist < 10) {
                    if (s.stepsDone < wheelPaces) {
                        s.turning = true;
                        const tx = s.x - currentPivotGate.x, ty = s.y - currentPivotGate.y;
                        s.x = Math.round(currentPivotGate.x + (tx * Math.cos(rad) - ty * Math.sin(rad)));
                        s.y = Math.round(currentPivotGate.y + (tx * Math.sin(rad) + ty * Math.cos(rad)));
                        s.localFacing += stepAngle;
                        s.stepsDone++;
                    } else {
                        const r = (currentPivotGate.targetFacing * Math.PI) / 180;
                        s.x += Math.round(Math.sin(r)) * 40; s.y += -Math.round(Math.cos(r)) * 40;
                        s.localFacing = currentPivotGate.targetFacing;
                    }
                } else {
                    const r = (visualFacing * Math.PI) / 180;
                    s.x += Math.round(Math.sin(r)) * 40; s.y += -Math.round(Math.cos(r)) * 40;
                }
            });
            if (squad.every(s => s.rIdx === -1 || s.stepsDone >= wheelPaces)) visualFacing = currentPivotGate.targetFacing;
        } else if (type.includes("Order")) {
            const angleDiff = Math.abs((visualFacing - structuralFront) % 180);
            if (angleDiff > 1 && angleDiff < 179) { resolve(); return; }
            const isOpenCmd = type.includes("Open");
            if (isOpenCmd !== isOpened) {
                isOpened = isOpenCmd;
                const mult = isOpened ? 1 : -1;
                const r = (structuralFront * Math.PI) / 180;
                const dx = Math.round(Math.sin(r)) * 120 * mult, dy = -Math.round(Math.cos(r)) * 120 * mult;
                squad.forEach(s => {
                    if (s.rIdx === 0 || s.rIdx === -1) { s.x += dx; s.y += dy; }
                    else if (s.rIdx === 2) { s.x -= dx; s.y -= dy; }
                });
                document.getElementById('status-display').innerText = "State: " + (isOpened ? "Open Order" : "Closed Order");
            }
        }
        updateVisuals(); resolve();
    });
}

function updateVisuals() {
    squad.forEach(m => {
        m.el.style.left = m.x + 'px'; m.el.style.top = m.y + 'px';
        m.el.style.transform = `rotate(${m.localFacing || visualFacing}deg)`;
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

// Initial setup on load
for (let i = 1; i <= 5; i++) document.getElementById('move-list').appendChild(createRow(i));
initSim();