import { makeSupabaseClient, requireSession } from "./auth.js";
import { DB } from "./config.js";
import { el, setStatus } from "./utils.js";

const sb = makeSupabaseClient();
let currentWeekOffset = 0;

document.addEventListener("DOMContentLoaded", init);

async function init() {
    const session = await requireSession(sb);
    if (!session) return;

    // Knoppen instellen
    if (el("btnPrev")) el("btnPrev").onclick = () => { currentWeekOffset--; updateUI(); };
    if (el("btnNext")) el("btnNext").onclick = () => { currentWeekOffset++; updateUI(); };

    await updateUI();
}

async function updateUI() {
    setStatus(el("status"), "Data ophalen...");
    
    // 1. Haal projecten op
    const { data: projects, error: pErr } = await sb.from(DB.tables.projects).select("*");
    // 2. Haal secties op
    const { data: sections, error: sErr } = await sb.from(DB.tables.sections).select("*");
    // 3. Haal capaciteit/werknemers op (voor de onderste balk in de PDF)
    const { data: employees } = await sb.from(DB.tables.employees).select("*");

    if (pErr || sErr) {
        setStatus(el("status"), "Fout bij laden: " + (pErr?.message || sErr?.message), "error");
        return;
    }

    renderPlanning(projects, sections);
    renderCapacity(employees); // De onderste rij in je PDF
    
    // Update de weektitel
    const now = new Date();
    now.setDate(now.getDate() + (currentWeekOffset * 7));
    el("current-week-label").textContent = `Week ${getWeekNumber(now)}`;
    
    setStatus(el("status"), "");
}

function renderPlanning(projects, sections) {
    const grid = el("planningGrid");
    grid.innerHTML = "";

    projects.forEach(proj => {
        const projSections = sections.filter(s => s[DB.sectionProjectFk] === proj[DB.projectPkCol]);
        
        // Bereken totalen
        const wvb = proj.total_wvb || sum(projSections, "uren_wvb");
        const prod = proj.total_prod || sum(projSections, "uren_prod");
        const mont = proj.total_mont || sum(projSections, "uren_montage");

        const row = document.createElement("div");
        row.className = "planning-row";
        row.innerHTML = `
            <div class="proj-meta">
                <div class="nr">${proj[DB.projectNoCol] || 'Onbekend'}</div>
                <div class="name">${proj[DB.projectNameCol] || 'Geen naam'}</div>
            </div>
            <div class="timeline">
                <div class="bar wvb" style="width: ${Math.min(wvb, 100)}px" title="WVB: ${wvb}u"></div>
                <div class="bar prod" style="width: ${Math.min(prod, 100)}px" title="Prod: ${prod}u"></div>
                <div class="bar mont" style="width: ${Math.min(mont, 100)}px" title="Mont: ${mont}u"></div>
                <div class="deadline-marker" title="Opleverdatum: ${proj.delivery_date}"></div>
            </div>
        `;
        grid.appendChild(row);
    });
}

function renderCapacity(employees) {
    // Hier bouwen we de gekleurde vakjes onderaan de PDF
    // Groen = over, Oranje = 0, Rood = tekort
    const capDiv = el("capacity-summary"); // Zorg dat dit ID in je HTML staat
    if (!capDiv) return;
    
    // Dummy logica voor demo, dit moet gekoppeld worden aan je uren-tabel
    const urenBeschikbaar = 40; 
    const urenGepland = 32;
    const diff = urenBeschikbaar - urenGepland;
    
    let kleur = "green";
    if (diff === 0) kleur = "orange";
    if (diff < 0) kleur = "red";

    capDiv.innerHTML = `<div class="cap-tile ${kleur}">Beschikbaar: ${diff}u</div>`;
}

// Helpers
function sum(arr, key) { return arr.reduce((a, b) => a + (Number(b[key]) || 0), 0); }
function getWeekNumber(d) {
    d = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
    var yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
}
