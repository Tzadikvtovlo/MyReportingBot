let accounts = [];
let globalGasUrl = "";
let globalAutoSuffix = true;
let globalMuteNotifications = false;
let editingAccountId = null;

const sunIcon = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="5"></circle><line x1="12" y1="1" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line><line x1="1" y1="12" x2="3" y2="12"></line><line x1="21" y1="12" x2="23" y2="12"></line><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line></svg>`;
const moonIcon = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path></svg>`;

function updateThemeIcon(isDark) {
    const btn = document.getElementById('toggleThemeBtn');
    btn.innerHTML = isDark ? sunIcon : moonIcon; 
    btn.title = isDark ? "החלף למצב בהיר" : "החלף למצב כהה";
}

// ========================
// מודל פנימי חכם
// ========================
function showModal(title, message, type, onConfirm, placeholder = "") {
    document.getElementById('modalTitle').innerText = title;
    document.getElementById('modalMessage').innerText = message;
    
    const inputContainer = document.getElementById('modalInputContainer');
    const inputEl = document.getElementById('modalInput');
    const cancelBtn = document.getElementById('modalCancelBtn');
    
    if (type === 'prompt') {
        inputContainer.style.display = 'block';
        inputEl.value = '';
        inputEl.placeholder = placeholder;
        setTimeout(() => inputEl.focus(), 100);
    } else {
        inputContainer.style.display = 'none';
    }
    
    cancelBtn.style.display = (type === 'alert') ? 'none' : 'block';
    
    const overlay = document.getElementById('customModal');
    overlay.style.display = 'flex';
    
    const confirmBtn = document.getElementById('modalConfirmBtn');
    const newConfirm = confirmBtn.cloneNode(true);
    const newCancel = cancelBtn.cloneNode(true);
    confirmBtn.parentNode.replaceChild(newConfirm, confirmBtn);
    cancelBtn.parentNode.replaceChild(newCancel, cancelBtn);
    
    newConfirm.addEventListener('click', () => {
        overlay.style.display = 'none';
        if(type === 'prompt') onConfirm(inputEl.value);
        else onConfirm(true);
    });
    newCancel.addEventListener('click', () => {
        overlay.style.display = 'none';
    });
}

document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
            btn.classList.add('active');
            document.getElementById(btn.dataset.tab).classList.add('active');
        });
    });

    document.getElementById('openSidePanelBtn').addEventListener('click', () => {
        chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
            chrome.sidePanel.open({ windowId: tabs[0].windowId });
            window.close();
        });
    });
    document.getElementById('openOptionsBtn').addEventListener('click', () => {
        chrome.runtime.openOptionsPage();
    });

    document.getElementById('toggleThemeBtn').addEventListener('click', () => {
        const wrapper = document.getElementById('logWrapper');
        const isCurrentlyDark = wrapper.classList.contains('dark-mode');
        
        if (isCurrentlyDark) {
            wrapper.classList.replace('dark-mode', 'light-mode');
            chrome.storage.local.set({ logTheme: 'light-mode' });
            updateThemeIcon(false);
        } else {
            wrapper.classList.replace('light-mode', 'dark-mode');
            chrome.storage.local.set({ logTheme: 'dark-mode' });
            updateThemeIcon(true);
        }
    });

    // קרדיטים - העתקת אימייל מותאמת לעיצוב הלינק
    document.getElementById('copyEmailBtn').addEventListener('click', (e) => {
        e.preventDefault();
        navigator.clipboard.writeText('q9411aa@gmail.com').then(() => {
            const msg = document.getElementById('copyEmailMsg');
            msg.classList.add('show');
            setTimeout(() => msg.classList.remove('show'), 2000);
        });
    });

    chrome.storage.local.get(['accountsList', 'globalGasUrl', 'globalAutoSuffix', 'globalMuteNotifications', 'logTheme', 'updateAvailable'], (res) => {
        accounts = res.accountsList || [];
        globalGasUrl = res.globalGasUrl || "";
        globalAutoSuffix = res.globalAutoSuffix !== false; 
        globalMuteNotifications = res.globalMuteNotifications === true;
        
        const isDark = !res.logTheme || res.logTheme === 'dark-mode';
        if (res.logTheme) document.getElementById('logWrapper').className = `card log-container ${res.logTheme}`;
        updateThemeIcon(isDark);
        
        document.getElementById('gasUrlInput').value = globalGasUrl;
        document.getElementById('globalAutoSuffix').checked = globalAutoSuffix;
        document.getElementById('globalMuteNotifications').checked = globalMuteNotifications;
        
        renderAccounts();
        updateAccountSelect();
        
        document.getElementById('currentVersionBadge').innerText = "V " + chrome.runtime.getManifest().version;

        if (res.updateAvailable) {
            document.getElementById('updateBanner').style.display = 'flex';
        }
    });

    chrome.runtime.sendMessage({ type: "REQUEST_STATE" }, (state) => {
        if (state && state.isRunning) {
            document.getElementById('startBtn').style.display = 'none';
            document.getElementById('stopBtn').style.display = 'flex';
            document.getElementById('logArea').innerHTML = '';
            state.logs.forEach(l => appendLog(l.text, l.status, l.time));
        }
    });
});

document.getElementById('accountSelect').addEventListener('change', (e) => {
    const accId = e.target.value;
    const infoDiv = document.getElementById('lastReportInfo');
    if(!accId) { infoDiv.innerText = ''; return; }
    
    const acc = accounts.find(a => a.id === accId);
    if(acc && acc.history && acc.history.length > 0) {
        const last = acc.history[0];
        infoDiv.innerHTML = `דיווח קודם: <strong style="color:var(--primary);">${last.meter}</strong> (עודכן ב-${new Date(last.date).toLocaleDateString('he-IL')})`;
    } else {
        infoDiv.innerHTML = `אין דיווחים קודמים לחשבון זה במערכת.`;
    }
});

// ========================
// ניהול חשבונות
// ========================
function resetAccountForm() {
    editingAccountId = null;
    document.getElementById('newAccName').value = '';
    document.getElementById('newAccTz').value = '';
    document.getElementById('newAccGas').value = '';
    document.getElementById('newAccSuffix').checked = true;
    
    document.getElementById('accountFormTitle').innerText = "הוספת חשבון חדש";
    document.getElementById('addAccBtn').innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg> שמור חשבון`;
    document.getElementById('cancelEditBtn').style.display = 'none';
}

document.getElementById('cancelEditBtn').addEventListener('click', resetAccountForm);

document.getElementById('addAccBtn').addEventListener('click', () => {
    const name = document.getElementById('newAccName').value.trim();
    const tz = document.getElementById('newAccTz').value.trim();
    const gas = document.getElementById('newAccGas').value.trim();
    const autoSuffix = document.getElementById('newAccSuffix').checked;

    if (!name || !tz) return showModal("שגיאה", "חובה למלא שם ותעודת זהות.", "alert", () => {});
    
    if (editingAccountId) {
        const acc = accounts.find(a => a.id === editingAccountId);
        if (acc) {
            acc.name = name;
            acc.tz = tz;
            acc.gas = gas;
            acc.autoSuffix = autoSuffix;
        }
    } else {
        accounts.push({ 
            id: Date.now().toString(), 
            name, tz, gas, autoSuffix, reminder: null,
            history: [] 
        });
    }
    
    saveAccounts(() => {
        resetAccountForm();
        renderAccounts();
        updateAccountSelect();
    });
});

function saveAccounts(callback) {
    chrome.storage.local.set({ accountsList: accounts }, callback);
}

window.toggleAcc = function(id) {
    const body = document.getElementById(`acc-body-${id}`);
    if(body) body.classList.toggle('open');
};

function renderAccounts() {
    const list = document.getElementById('accountsList');
    list.innerHTML = accounts.length === 0 ? '<div style="text-align:center; padding:20px; color:var(--text-muted);">לא הוגדרו חשבונות.</div>' : '';
    
    accounts.forEach(acc => {
        let histHtml = (!acc.history || acc.history.length === 0) ? '<li class="history-item">אין עדיין היסטוריית דיווחים.</li>' : '';
        if(acc.history) {
            acc.history.forEach(h => {
                histHtml += `<li class="history-item"><span>${new Date(h.date).toLocaleDateString('he-IL')}</span> <strong>${h.meter}</strong></li>`;
            });
        }

        const alertIcon = acc.reminder 
            ? `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path><path d="M13.73 21a2 2 0 0 1-3.46 0"></path></svg>` 
            : `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M13.73 21a2 2 0 0 1-3.46 0"></path><path d="M18.63 13A17.89 17.89 0 0 1 18 8"></path><path d="M6.26 6.26A5.86 5.86 0 0 0 6 8c0 7-3 9-3 9h14"></path><path d="M18 8a6 6 0 0 0-9.33-5"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>`;
        
        const useSuffix = acc.autoSuffix !== false; 
        
        const div = document.createElement('div');
        div.className = "acc-card";
        div.innerHTML = `
            <div class="acc-header" data-id="${acc.id}">
                <span class="acc-title">${acc.name} (${acc.tz})</span>
                <div class="acc-actions">
                    <button class="acc-btn reminder-btn" data-id="${acc.id}" title="ערוך התראה (${acc.reminder ? acc.reminder + ' ימים' : 'כבויה'})">
                        ${alertIcon}
                    </button>
                    <button class="acc-btn edit-btn" data-id="${acc.id}" title="ערוך">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                    </button>
                    <button class="acc-btn delete-btn" data-id="${acc.id}" title="מחק">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                    </button>
                </div>
            </div>
            <div class="acc-body" id="acc-body-${acc.id}">
                <div style="font-size:12px; margin-bottom:10px; color:var(--text-muted);">
                    GAS אישי: ${acc.gas ? 'מוגדר ✓' : 'משתמש בכללי'} | סיומת: ${useSuffix ? 'כן' : 'לא'}
                </div>
                <strong>דיווחים אחרונים:</strong>
                <ul class="history-list">${histHtml}</ul>
            </div>
        `;
        list.appendChild(div);
    });

    document.querySelectorAll('.acc-header').forEach(el => {
        el.addEventListener('click', () => toggleAcc(el.dataset.id));
    });

    document.querySelectorAll('.delete-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            showModal('מחיקת חשבון', 'האם אתה בטוח שברצונך למחוק את החשבון לצמיתות?', 'confirm', () => {
                accounts = accounts.filter(a => a.id !== btn.dataset.id);
                saveAccounts(() => { renderAccounts(); updateAccountSelect(); });
            });
        });
    });

    document.querySelectorAll('.reminder-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const acc = accounts.find(a => a.id === btn.dataset.id);
            if(!acc) return;
            
            showModal('הגדרת התראת דיווח', 'הזן כל כמה ימים תרצה לקבל התראה (השאר ריק כדי לבטל):', 'prompt', (val) => {
                const num = parseInt(val);
                acc.reminder = (isNaN(num) || num <= 0) ? null : num;
                saveAccounts(() => { renderAccounts(); });
            }, acc.reminder || "למשל: 30");
        });
    });

    document.querySelectorAll('.edit-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const acc = accounts.find(a => a.id === btn.dataset.id);
            if(!acc) return;
            
            document.getElementById('newAccName').value = acc.name;
            document.getElementById('newAccTz').value = acc.tz;
            document.getElementById('newAccGas').value = acc.gas || '';
            document.getElementById('newAccSuffix').checked = acc.autoSuffix !== false;
            
            editingAccountId = acc.id;
            document.getElementById('accountFormTitle').innerText = "עריכת חשבון: " + acc.name;
            document.getElementById('addAccBtn').innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path><polyline points="17 21 17 13 7 13 7 21"></polyline><polyline points="7 3 7 8 15 8"></polyline></svg> עדכן חשבון`;
            document.getElementById('cancelEditBtn').style.display = 'block';
            
            document.getElementById('accountsTab').scrollTo({ top: document.getElementById('accountsTab').scrollHeight, behavior: 'smooth' });
        });
    });
}

function updateAccountSelect() {
    const sel = document.getElementById('accountSelect');
    sel.innerHTML = accounts.length ? '<option value="">בחר חשבון...</option>' : '<option value="">יש להוסיף חשבון בהגדרות</option>';
    accounts.forEach(acc => {
        sel.innerHTML += `<option value="${acc.id}">${acc.name} - ${acc.tz}</option>`;
    });
    document.getElementById('accountSelect').dispatchEvent(new Event('change'));
}

// ========================
// הגדרות ועדכונים
// ========================
document.getElementById('saveSettingsBtn').addEventListener('click', () => {
    globalGasUrl = document.getElementById('gasUrlInput').value.trim();
    globalAutoSuffix = document.getElementById('globalAutoSuffix').checked;
    globalMuteNotifications = document.getElementById('globalMuteNotifications').checked;

    chrome.storage.local.set({ globalGasUrl, globalAutoSuffix, globalMuteNotifications }, () => {
        const statusMsg = document.getElementById('settingsStatus');
        statusMsg.innerText = "ההגדרות הכלליות נשמרו בהצלחה!";
        statusMsg.style.color = "var(--success)";
        setTimeout(() => statusMsg.innerText = '', 3000);
    });
});

document.getElementById('exportLogsBtn').addEventListener('click', () => {
    chrome.storage.local.get(['systemLogs'], (res) => {
        const logs = res.systemLogs || [];
        if(logs.length === 0) return showModal('שגיאה', 'אין עדיין היסטוריית לוגים במערכת להורדה.', 'alert', () => {});
        const blob = new Blob([JSON.stringify(logs, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        chrome.downloads.download({ url, filename: `IEC_Bot_Logs_${new Date().getTime()}.json` });
    });
});

// מחיקת יומן
document.getElementById('clearLogsBtn').addEventListener('click', () => {
    showModal('מחיקת יומן', 'האם אתה בטוח שברצונך למחוק את כל היסטוריית הלוגים השמורה של המערכת?', 'confirm', () => {
        chrome.storage.local.remove(['systemLogs'], () => {
            const statusMsg = document.getElementById('settingsStatus');
            statusMsg.innerText = "היסטוריית היומן נמחקה בהצלחה!";
            statusMsg.style.color = "var(--success)";
            setTimeout(() => statusMsg.innerText = '', 3000);
        });
    });
});

// לחיצה על כרטיסיית הגרסה בודקת עדכונים
document.getElementById('versionCardBtn').addEventListener('click', () => {
    const badge = document.getElementById('currentVersionBadge');
    const statusMsg = document.getElementById('settingsStatus');
    
    badge.innerText = "בודק...";
    statusMsg.innerText = "";
    
    chrome.runtime.sendMessage({ type: "CHECK_UPDATES_NOW" }, (res) => {
        badge.innerText = "V " + chrome.runtime.getManifest().version;
        if(res && res.hasUpdate) {
            document.getElementById('updateBanner').style.display = 'flex';
            statusMsg.innerText = "נמצא עדכון חדש! לחץ בבאנר למעלה להורדה.";
            statusMsg.style.color = "var(--primary)";
        } else if (res && res.error) {
            statusMsg.innerText = res.error;
            statusMsg.style.color = "var(--text-muted)";
        } else {
            statusMsg.innerText = "התוסף מעודכן לגרסה האחרונה!";
            statusMsg.style.color = "var(--success)";
        }
        setTimeout(() => { if(!res || !res.hasUpdate) statusMsg.innerText = ''; }, 5000);
    });
});

document.getElementById('downloadUpdateBtn').addEventListener('click', () => {
    window.open("https://github.com/Tzadikvtovlo/MyReportingBot/releases/latest/download/MyReportingBot.zip", "_blank");
});

// ========================
// מערכת הדיווח
// ========================
document.getElementById('stopBtn').addEventListener('click', () => {
    chrome.runtime.sendMessage({ type: "STOP_BOT" });
});

document.getElementById('startBtn').addEventListener('click', () => {
    const accId = document.getElementById('accountSelect').value;
    const meter = document.getElementById('meterInput').value.trim();
    const testMode = document.getElementById('testMode').checked;
    const forceLogout = document.getElementById('forceLogout').checked;

    if (!accId) return showModal("שגיאה", "אנא בחר חשבון לדיווח.", "alert", () => {});
    if (!meter) return showModal("שגיאה", "אנא הזן מצב מונה.", "alert", () => {});

    const account = accounts.find(a => a.id === accId);
    let gasUrl = account.gas || globalGasUrl;
    
    if (!gasUrl) {
        showModal("הגדרת קישור חסר", "לא מוגדר קישור GAS כללי או אישי לחשבון. אנא הזן אותו כאן כדי להמשיך:", "prompt", (val) => {
            if(!val) return;
            globalGasUrl = val;
            chrome.storage.local.set({ globalGasUrl });
            startBotProcessing(account, meter, testMode, forceLogout, globalGasUrl);
        }, "https://script.google.com/...");
        return;
    }

    startBotProcessing(account, meter, testMode, forceLogout, gasUrl);
});

function startBotProcessing(account, meter, testMode, forceLogout, gasUrl) {
    const useSuffix = account.gas ? (account.autoSuffix !== false) : globalAutoSuffix;
    if (useSuffix && !gasUrl.includes("action=getIecOtp")) {
        gasUrl += gasUrl.includes("?") ? "&action=getIecOtp" : "?action=getIecOtp";
    }

    document.getElementById('logArea').innerHTML = ''; 
    document.getElementById('startBtn').style.display = 'none';
    document.getElementById('stopBtn').style.display = 'flex';

    chrome.runtime.sendMessage({
        type: "START_BOT",
        config: { 
            accountId: account.id,
            tz: account.tz, 
            meter: meter, 
            testMode: testMode, 
            forceLogout: forceLogout,
            gasUrl: gasUrl 
        }
    });
}

chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === "PROGRESS") {
        appendLog(msg.text, msg.status, msg.time);
    }
    if (msg.type === "DONE_OR_ERROR") {
        document.getElementById('startBtn').style.display = 'flex';
        document.getElementById('stopBtn').style.display = 'none';
        
        chrome.storage.local.get(['accountsList'], (res) => {
            if(res.accountsList) {
                accounts = res.accountsList;
                renderAccounts();
                document.getElementById('accountSelect').dispatchEvent(new Event('change'));
            }
        });
    }
});

function appendLog(msg, status, timeStr) {
    const area = document.getElementById('logArea');
    const time = timeStr || new Date().toLocaleTimeString('he-IL', { hour12: false });
    
    let icon = "⏳";
    let colorClass = "status-loading";
    if (status === 'success') { icon = "✅"; colorClass = "status-success"; }
    if (status === 'error') { icon = "❌"; colorClass = "status-error"; }

    const entry = document.createElement('div');
    entry.className = `log-entry ${colorClass}`;
    entry.innerHTML = `<span class="log-time">[${time}]</span><span class="log-msg">${icon} ${msg}</span>`;
    
    area.appendChild(entry);
    area.scrollTop = area.scrollHeight;
}