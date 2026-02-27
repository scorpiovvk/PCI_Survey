const express = require('express');
const fs = require('fs');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 3000;

// Security Credentials
const ADMIN_PIN = '6362';
const ADMIN_PASS = 'VIP2026';

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve the main questionnaire
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// API endpoint to receive survey responses
app.post('/api/submit', (req, res) => {
    const dataFile = path.join(__dirname, 'survey_database.json');
    let currentData = [];
    if (fs.existsSync(dataFile)) {
        currentData = JSON.parse(fs.readFileSync(dataFile, 'utf8'));
    }
    currentData.push(req.body);
    fs.writeFileSync(dataFile, JSON.stringify(currentData, null, 2));
    res.status(200).json({ message: 'Data saved successfully' });
});

// Admin Authentication Middleware
const authenticate = (req, res, next) => {
    const b64auth = (req.headers.authorization || '').split(' ')[1] || '';
    const [login, password] = Buffer.from(b64auth, 'base64').toString().split(':');

    if ((login === 'admin' && password === ADMIN_PASS) || (login === 'admin' && password === ADMIN_PIN)) {
        return next();
    }
    res.set('WWW-Authenticate', 'Basic realm="401"');
    res.status(401).send('Authentication required. Use PIN or Password provided.');
};

// --- ANALYTICAL FUNCTIONS ---

const EXPECTATION_LABELS = ['Complete cure', 'Symptom reduction', 'Secondary prevention', 'Functional improvement', 'Unsure'];
const IC_HOSP_LABELS = ['Corporate tertiary', 'Mid-tier private', 'Govt/Teaching', 'Standalone cath lab', 'Multi-site'];

function generatePatientSubsetAnalysis(db) {
    const patients = db.filter(entry => entry.cohort === 'patient');
    if (patients.length === 0) return '<p style="color:#9ab0cc;">Not enough patient data yet.</p>';

    let expectationAdherence = {};
    patients.forEach(p => {
        const adherenceScore = p.calculatedScores?.economics || 0;
        const expIdx = p.responses?.pt_exp_out;
        if (expIdx !== undefined) {
            const expLabel = EXPECTATION_LABELS[expIdx] || 'Unknown';
            if (!expectationAdherence[expLabel]) expectationAdherence[expLabel] = { sum: 0, count: 0 };
            expectationAdherence[expLabel].sum += adherenceScore;
            expectationAdherence[expLabel].count += 1;
        }
    });

    let html = '';
    for (const [label, data] of Object.entries(expectationAdherence)) {
        const avg = Math.round(data.sum / data.count);
        let strategy = avg < 60 ? '🚨 HIGH RISK: Deploy "Residual Risk" reality-check counseling. Shift messaging to maintenance.' : '✅ STABLE: Standard DAPT SMS reminders.';
        html += `<tr><td>${label} (n=${data.count})</td><td>${avg}/100</td><td>${strategy}</td></tr>`;
    }
    return `<h3>Patient Subset: Adherence by Procedural Expectation</h3>
            <table><tr><th>Patient Expectation</th><th>Avg Adherence Score</th><th>Execution Strategy</th></tr>${html}</table>`;
}

function generateICSubsetAnalysis(db) {
    const ics = db.filter(entry => entry.cohort === 'ic');
    if (ics.length === 0) return '<p style="color:#9ab0cc;">Not enough IC data yet.</p>';

    let settingAnalysis = {};
    ics.forEach(ic => {
        const econScore = ic.calculatedScores?.economics || 0;
        const evidenceScore = ic.calculatedScores?.evidence || 0;
        const hospIdx = ic.responses?.ic_hosp;
        if (hospIdx !== undefined) {
            const label = IC_HOSP_LABELS[hospIdx] || 'Unknown';
            if (!settingAnalysis[label]) settingAnalysis[label] = { econSum: 0, evidenceSum: 0, count: 0 };
            settingAnalysis[label].econSum += econScore;
            settingAnalysis[label].evidenceSum += evidenceScore;
            settingAnalysis[label].count += 1;
        }
    });

    let html = '';
    for (const [label, data] of Object.entries(settingAnalysis)) {
        const avgEcon = Math.round(data.econSum / data.count);
        const avgEvidence = Math.round(data.evidenceSum / data.count);
        let strategy = label === 'Corporate tertiary' && avgEvidence >= 70 ? 'Clinical Superiority: Deploy HTA dossiers for premium formulary inclusion.' : 'Operational Efficiency: Focus on throughput and supply reliability.';
        html += `<tr><td><strong>${label}</strong> (n=${data.count})</td><td>${avgEvidence}/100</td><td>${avgEcon}/100</td><td>${strategy}</td></tr>`;
    }
    return `<h3 style="margin-top:24px;">IC Subset: Drivers by Practice Setting</h3>
            <table><tr><th>Practice Setting</th><th>Evidence Trust</th><th>Econ Constraint</th><th>Strategic Focus</th></tr>${html}</table>`;
}

// --- ADMIN ROUTES ---

app.get('/admin', authenticate, (req, res) => {
    const dataFile = path.join(__dirname, 'survey_database.json');
    let db = fs.existsSync(dataFile) ? JSON.parse(fs.readFileSync(dataFile, 'utf8')) : [];

    const adminHTML = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <title>Clinical Affairs Dashboard</title>
        <style>
            body { font-family: 'Segoe UI', sans-serif; background: #080f1e; color: #e8edf5; padding: 40px; }
            .card { background: #0f1f38; padding: 24px; border-radius: 12px; border: 1px solid #1e3558; margin-bottom: 24px; }
            .header-flex { display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px; }
            h1, h2, h3 { color: #00c4cc; margin-top: 0; }
            table { width: 100%; border-collapse: collapse; margin-top: 16px; font-size: 13.5px; background: #162844; }
            th, td { padding: 14px; text-align: left; border-bottom: 1px solid #1e3558; }
            th { background: #112240; color: #9ab0cc; text-transform: uppercase; font-size: 11px; letter-spacing: 0.1em; }
            .badge { background: rgba(0,196,204,0.15); color: #00c4cc; padding: 4px 8px; border-radius: 4px; font-weight: bold; font-size: 11px;}
            .btn-export { background: #00c4cc; color: #080f1e; padding: 10px 20px; text-decoration: none; border-radius: 6px; font-weight: bold; font-size: 14px; }
        </style>
    </head>
    <body>
        <div class="header-flex">
            <h1>Strategy Dashboard</h1>
            <a href="/admin/export" class="btn-export">📥 Export to CSV</a>
        </div>
        <div class="card">
            <h2>Executive Summary</h2>
            <p>Total Captured Profiles: <strong>${db.length}</strong></p>
        </div>
        <div class="card">
            <h2>Evidence-Based Strategic Interventions</h2>
            ${generatePatientSubsetAnalysis(db)}
            ${generateICSubsetAnalysis(db)}
        </div>
        <div class="card">
            <h2>Raw Cohort Data Log</h2>
            <table>
                <tr><th>Timestamp</th><th>Cohort</th><th>Classification</th><th>Evidence</th><th>Experience</th><th>Economics</th></tr>
                ${db.reverse().map(entry => `
                <tr>
                    <td>${new Date(entry.timestamp).toLocaleString([], {month:'short', day:'numeric'})}</td>
                    <td><span class="badge">${entry.cohort.toUpperCase()}</span></td>
                    <td><strong>${entry.segment}</strong></td>
                    <td>${entry.calculatedScores?.evidence || 'N/A'}</td>
                    <td>${entry.calculatedScores?.experience || 'N/A'}</td>
                    <td>${entry.calculatedScores?.economics || 'N/A'}</td>
                </tr>`).join('')}
            </table>
        </div>
    </body>
    </html>`;
    res.send(adminHTML);
});

// CSV Export Route
app.get('/admin/export', authenticate, (req, res) => {
    const dataFile = path.join(__dirname, 'survey_database.json');
    if (!fs.existsSync(dataFile)) return res.status(404).send('No data found.');
    
    const db = JSON.parse(fs.readFileSync(dataFile, 'utf8'));
    const headers = ['Timestamp', 'Cohort', 'Segment', 'Evidence', 'Experience', 'Economics'];
    const rows = db.map(entry => [
        entry.timestamp, entry.cohort, `"${entry.segment || 'N/A'}"`, 
        entry.calculatedScores?.evidence || '', entry.calculatedScores?.experience || '', entry.calculatedScores?.economics || ''
    ].join(','));

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="CardioStent_Data.csv"');
    res.send(headers.join(',') + '\n' + rows.join('\n'));
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));