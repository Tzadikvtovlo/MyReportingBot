let botState = {
    isRunning: false,
    shouldStop: false,
    winId: null,
    logs: []
};

// ==========================================
// 1. אתחול והגדרת משימות רקע (Alarms)
// ==========================================
chrome.runtime.onInstalled.addListener(() => {
    chrome.alarms.create("dailyCheck", { periodInMinutes: 720 });
    checkUpdates();
});

chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === "dailyCheck") {
        checkUpdates();
        checkReminders();
    }
});

// ==========================================
// 2. ניהול תקשורת (Messages)
// ==========================================
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.type === "START_BOT") {
        startBotTab(msg.config);
        return true;
    }
    if (msg.type === "STOP_BOT") {
        botState.shouldStop = true;
        if (botState.winId) {
            chrome.windows.remove(botState.winId).catch(()=>{});
            botState.winId = null;
        }
        sendLog("הריצה נעצרה על ידי המשתמש", "error");
        finishBot();
        return true;
    }
    if (msg.type === "REQUEST_STATE") {
        sendResponse(botState);
        return true;
    }
    if (msg.type === "CHECK_UPDATES_NOW") {
        checkUpdates().then(result => sendResponse(result));
        return true;
    }
    if (msg.type === "FETCH_OTP") {
        fetch(msg.url)
            .then(res => res.json())
            .then(data => sendResponse(data))
            .catch(err => sendResponse({ success: false, error: err.toString() }));
        return true;
    }
});

// ==========================================
// 3. שמירת היסטוריית לוגים למערכת
// ==========================================
function saveSystemLog(text, status) {
    chrome.storage.local.get(['systemLogs'], (res) => {
        let logs = res.systemLogs || [];
        logs.push({ time: new Date().toISOString(), text, status });
        if (logs.length > 500) logs = logs.slice(logs.length - 500);
        chrome.storage.local.set({ systemLogs: logs });
    });
}

function sendLog(text, status = "loading") {
    const time = new Date().toLocaleTimeString('he-IL', { hour12: false });
    botState.logs.push({ text, status, time });
    saveSystemLog(text, status);
    
    chrome.runtime.sendMessage({ type: "PROGRESS", text, status, time }).catch(() => {});
    console.log(`[BOT] ${text}`);
}

function finishBot() {
    botState.isRunning = false;
    chrome.runtime.sendMessage({ type: "DONE_OR_ERROR" }).catch(() => {});
}

function showNotification(title, message) {
    chrome.notifications.create({
        type: 'basic',
        iconUrl: 'icon/icon128.png', 
        title: title,
        message: message,
        priority: 2
    });
}

// ==========================================
// 4. בדיקת עדכונים מ-GitHub
// ==========================================
async function checkUpdates() {
    try {
        const res = await fetch("https://api.github.com/repos/Tzadikvtovlo/MyReportingBot/releases/latest");
        if (!res.ok) {
            return { hasUpdate: false, error: "אין גרסאות זמינות במאגר כרגע." };
        }
        
        const data = await res.json();
        const currentVersion = chrome.runtime.getManifest().version;
        
        if (data.tag_name) {
            const fetchedVersion = data.tag_name.replace('v', '').trim();
            if (fetchedVersion !== currentVersion) {
                chrome.storage.local.set({ updateAvailable: true });
                showNotification("עדכון גרסה זמין", "גרסה חדשה של הבוט זמינה להורדה. כנס לתוסף לעדכון.");
                return { hasUpdate: true };
            }
        }
        
        chrome.storage.local.set({ updateAvailable: false });
        return { hasUpdate: false };
    } catch(e) {
        return { hasUpdate: false, error: "שגיאת רשת בבדיקת העדכונים" };
    }
}

// ==========================================
// 5. בדיקת התראות דיווח לחשבונות
// ==========================================
function checkReminders() {
    chrome.storage.local.get(['accountsList', 'globalMuteNotifications'], (res) => {
        if(res.globalMuteNotifications) return; 
        if(!res.accountsList) return;
        
        const now = Date.now();
        res.accountsList.forEach(acc => {
            if (acc.reminder) {
                let lastReportTime = (acc.history && acc.history.length > 0) ? acc.history[0].date : 0;
                let daysPassed = (now - lastReportTime) / (1000 * 60 * 60 * 24);
                
                if (daysPassed >= acc.reminder) {
                    showNotification("תזכורת דיווח מונה", `הגיע הזמן לדווח מונה עבור החשבון: ${acc.name}`);
                }
            }
        });
    });
}

function saveAccountHistory(accountId, meterValue) {
    chrome.storage.local.get(['accountsList'], (res) => {
        if(!res.accountsList) return;
        let accs = res.accountsList;
        let accIndex = accs.findIndex(a => a.id === accountId);
        if(accIndex > -1) {
            if(!accs[accIndex].history) accs[accIndex].history = [];
            accs[accIndex].history.unshift({ date: Date.now(), meter: meterValue });
            if (accs[accIndex].history.length > 7) {
                accs[accIndex].history = accs[accIndex].history.slice(0, 7);
            }
            chrome.storage.local.set({ accountsList: accs });
        }
    });
}

// ==========================================
// 6. ליבת הבוט - ניהול החלון והזרקות
// ==========================================
async function startBotTab(config) {
    botState.isRunning = true;
    botState.shouldStop = false;
    botState.logs = [];
    
    try {
        sendLog("יוצר חלון פעולה עצמאי...", "loading");
        const currentWin = await chrome.windows.getCurrent().catch(() => null);
        
        const winWidth = 400;
        const winHeight = currentWin && currentWin.height ? currentWin.height - 50 : 850;

        const win = await chrome.windows.create({
            url: "https://www.iec.co.il/meter-reading",
            type: "popup",
            width: winWidth,
            height: winHeight,
            left: currentWin ? currentWin.left + 50 : 50,
            top: currentWin ? currentWin.top + 25 : 50,
            focused: false // חלון ברקע כמבוקש
        });
        
        botState.winId = win.id;
        const tabId = win.tabs[0].id;

        sendLog("ממתין לטעינה ראשונית...", "loading");
        
        await new Promise((resolve) => {
            const listener = (tId, info) => {
                if (tId === tabId && info.status === 'complete') {
                    chrome.tabs.onUpdated.removeListener(listener);
                    resolve();
                }
            };
            chrome.tabs.onUpdated.addListener(listener);
            setTimeout(() => { chrome.tabs.onUpdated.removeListener(listener); resolve(); }, 12000); 
        });

        await new Promise(r => setTimeout(r, 2000)); 
        if(botState.shouldStop) throw new Error("הריצה נעצרה על ידי המשתמש.");

        // === שלב 0: ניתוק מהחשבון ===
        if (config.forceLogout) {
            sendLog("מאתחל שלב ניתוק מקדים...", "loading");
            
            try {
                await chrome.scripting.executeScript({
                    target: { tabId },
                    func: injectLogoutPhase
                });
            } catch(e) {}
            
            sendLog("ממתין לסיום ניתובי ההתנתקות בשרת (כ-10 שניות)...", "loading");
            await new Promise(r => setTimeout(r, 10000));
            
            if(botState.shouldStop) throw new Error("הריצה נעצרה על ידי המשתמש.");
            
            sendLog("טוען מחדש את דף הדיווח הנקי...", "loading");
            chrome.tabs.update(tabId, { url: "https://www.iec.co.il/meter-reading" });
            
            await new Promise((resolve) => {
                const listener = (tId, info) => {
                    if (tId === tabId && info.status === 'complete') {
                        chrome.tabs.onUpdated.removeListener(listener);
                        resolve();
                    }
                };
                chrome.tabs.onUpdated.addListener(listener);
                setTimeout(() => { chrome.tabs.onUpdated.removeListener(listener); resolve(); }, 15000); 
            });
            
            await new Promise(r => setTimeout(r, 3000));
        }

        if(botState.shouldStop) throw new Error("הריצה נעצרה על ידי המשתמש.");

        // === שלב א': התחברות למערכת ===
        sendLog("מזריק סקריפט שלב א' (התחברות)...", "loading");
        try {
            let loginRes = await chrome.scripting.executeScript({
                target: { tabId },
                func: injectLoginPhase,
                args: [config]
            });
            if (loginRes[0]?.result && !loginRes[0].result.success) throw new Error(loginRes[0].result.error);
        } catch(e) {
            if (!e.message.toLowerCase().includes("frame") && !e.message.toLowerCase().includes("context")) throw e;
        }

        if(botState.shouldStop) throw new Error("הריצה נעצרה על ידי המשתמש.");
        
        // === שלב ב': דיווח מונה ===
        sendLog("ממתין לטעינת מסך הדיווח...", "loading");
        let attempts = 0;
        let finalResult = null;
        
        while(attempts < 30) {
            if(botState.shouldStop) throw new Error("הריצה נעצרה על ידי המשתמש.");
            await new Promise(r => setTimeout(r, 2000));
            attempts++;
            try {
                let meterRes = await chrome.scripting.executeScript({
                    target: { tabId },
                    func: injectMeterPhase,
                    args: [config]
                });
                
                let result = meterRes[0]?.result;
                if (result && result.ready) {
                    finalResult = result;
                    break;
                }
            } catch(e) {}
        }

        if(botState.shouldStop) throw new Error("הריצה נעצרה על ידי המשתמש.");
        if (!finalResult) throw new Error("זמן ההמתנה חלף. האתר נתקע בשלב מסוים.");
        
        if (finalResult.success) {
            if (finalResult.keepOpen) {
                // הוסר האמוג'י ✅ מהקוד כדי ש-app.js יוסיף אותו בצורה נקייה 
                sendLog("מצב אישור ידני הוגדר - עוצר לפני השליחה! החלון יישאר פתוח לבדיקתך.", "success");
                showNotification("מצב אישור ידני הסתיים", "החלון הושאר פתוח כדי שתוכל לבחון את הנתונים.");
                finishBot();
            } else {
                sendLog("התהליך הושלם בהצלחה!", "success");
                showNotification("דיווח חברת חשמל הצליח", `המונה עודכן ל-${config.meter}.`);
                saveAccountHistory(config.accountId, config.meter);
                finishBot();
                if(botState.winId) setTimeout(() => chrome.windows.remove(botState.winId), 4000);
            }
        } else {
            throw new Error(finalResult.error);
        }

    } catch (err) {
        if (!botState.shouldStop) {
            sendLog(`שגיאה: ${err.message}`, "error");
            showNotification("שגיאה בדיווח", err.message);
            finishBot();
            if (botState.winId) setTimeout(() => chrome.windows.remove(botState.winId), 4000);
        }
    }
}

// ==========================================
// סקריפטים להזרקה 
// ==========================================

// שלב 0: מנגנון ניתוק חכם, סבלני ומותאם לחלון רקע
async function injectLogoutPhase() {
    const log = (msg) => chrome.runtime.sendMessage({type: "PROGRESS", text: msg, status: "loading"});
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const utils = {
        clearPopups: function() {
            try {
                let btns = document.querySelectorAll('button, a, [role="button"]');
                for (let b of btns) {
                    let txt = b.innerText.trim();
                    if (["לא תודה", "המשך לאתר", "לסגירה", "סגור", "X", "אישור", "הבנתי", "מסכים", "אני מאשר"].includes(txt)) {
                        b.click();
                    }
                }
                let icons = document.querySelectorAll('.close-modal, .close-btn, [aria-label="סגור"], [aria-label="Close"]');
                for (let icon of icons) icon.click();
            } catch (e) {}
        }
    };
    
    try {
        log("ממתין לטעינת האתר כדי לבדוק מצב חיבור (עד 20 שניות)...");
        
        const startTime = Date.now();
        let state = await new Promise((resolve) => {
            const check = () => {
                utils.clearPopups(); 
                
                // אם רואים את השדה של תעודת הזהות - אנחנו כבר מנותקים ב-100%
                let tz = document.querySelector('#identificationwizard-input');
                if (tz) return resolve('logged_out');
                
                // אם רואים את האזור האישי - אנחנו מחוברים וצריך לנתק
                let profileBtn = document.querySelector('button.mat-mdc-menu-trigger.tw-border-brand-500') || 
                                 Array.from(document.querySelectorAll('button, a, span')).find(b => b.innerText && (b.innerText.includes('שלום') || b.innerText.includes('אזור אישי')));
                
                if (profileBtn) return resolve(profileBtn); // מחזירים את הכפתור עצמו
                
                // ממשיכים לחפש עד שיעברו 20 שניות
                if (Date.now() - startTime > 20000) return resolve('timeout');
                
                setTimeout(check, 500);
            };
            check();
        });

        if (state === 'logged_out') {
            log("זוהה מסך התחברות. המשתמש כבר מנותק.");
            return { success: true };
        }
        
        if (state === 'timeout') {
            log("זמן ההמתנה חלף ולא זוהה מצב ברור. ננסה להמשיך בניתוק עיוור...");
        } else {
            let profileBtn = state;
            log("פותח תפריט אזור אישי...");
            profileBtn.click();
            
            // צייד התפריטים (Overlay Hunter):
            let logoutBtn = null;
            for (let i = 0; i < 20; i++) { // מחכה עד 5 שניות לרינדור התפריט
                await sleep(250); 
                let overlay = document.querySelector('.cdk-overlay-container');
                if (overlay) {
                    let items = Array.from(overlay.querySelectorAll('.mat-mdc-menu-item, [role="menuitem"], button, a, span'));
                    logoutBtn = items.find(el => {
                        let txt = (el.innerText || "").trim();
                        return txt === 'התנתקות' || txt === 'התנתק' || txt === 'יציאה';
                    });
                    if (logoutBtn) break;
                }
            }
            
            if (logoutBtn) {
                log("כפתור התנתקות אותר בתוך התפריט! לוחץ...");
                let clickableBtn = logoutBtn.closest('.mat-mdc-menu-item') || logoutBtn.closest('button') || logoutBtn.closest('[role="menuitem"]') || logoutBtn;
                clickableBtn.click();
                try { clickableBtn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window })); } catch(e){}
                
                await sleep(2000); 
                return { success: true };
            } else {
                log("התפריט לא נפתח (כנראה כי החלון ברקע). מפעיל גיבויים...");
            }
        }
        
        // גיבוי 1: אולי כפתור יציאה יושב במסך הגלוי 
        let directLogout = Array.from(document.querySelectorAll('button, a, span')).find(el => {
            let txt = (el.innerText || "").trim();
            return txt === 'התנתקות' || txt === 'התנתק' || txt === 'יציאה';
        });
            
        if (directLogout) {
            log("מבצע התנתקות ישירה (ללא תפריט)...");
            let clickableBtn = directLogout.closest('button') || directLogout.closest('[role="menuitem"]') || directLogout;
            clickableBtn.click();
            try { clickableBtn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window })); } catch(e){}
            return { success: true };
        }

        // גיבוי 2 מוחץ: אם התפריט לא הופיע כי הכרום הקפיא אנימציות ברקע, ננתק דרך ה-API!
        log("שולח פקודת התנתקות ישירה לשרת (מצב רשת)...");
        try { await fetch('/api/auth/logout', { method: 'POST' }); } catch(e){}
        try { await fetch('https://iec-ext.okta.com/api/v1/sessions/me', { method: 'DELETE', mode: 'no-cors' }); } catch(e){}

        return { success: true };
    } catch(err) {
        return { success: true }; 
    }
}

// שלב א': התחברות
async function injectLoginPhase(config) {
    const log = (msg) => chrome.runtime.sendMessage({type: "PROGRESS", text: msg, status: "loading"});
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const utils = {
        clearPopups: function() {
            try {
                let btns = document.querySelectorAll('button, a, [role="button"]');
                for (let b of btns) {
                    let txt = b.innerText.trim();
                    if (["לא תודה", "המשך לאתר", "לסגירה", "סגור", "X", "אישור", "הבנתי", "מסכים", "אני מאשר"].includes(txt)) {
                        b.click();
                    }
                }
                let icons = document.querySelectorAll('.close-modal, .close-btn, [aria-label="סגור"], [aria-label="Close"]');
                for (let icon of icons) icon.click();
            } catch (e) {}
        },
        setNativeValue: function(el, value) {
            const lastValue = el.value;
            el.value = value;
            const event = new Event("input", { bubbles: true });
            if (el._valueTracker) el._valueTracker.setValue(lastValue);
            el.dispatchEvent(event);
            el.dispatchEvent(new Event("change", { bubbles: true }));
        }
    };

    try {
        if (!window.location.pathname.includes('meter-reading') && !window.location.pathname.includes('login')) {
            window.location.href = 'https://www.iec.co.il/meter-reading';
            return { success: true }; 
        }

        const startTime = Date.now();
        const state = await new Promise((resolve, reject) => {
            const check = () => {
                utils.clearPopups(); 
                let tz = document.querySelector('#identificationwizard-input');
                if (tz) return resolve({ type: 'login', el: tz });
                
                let profileBtn = document.querySelector('button.mat-mdc-menu-trigger.tw-border-brand-500');
                let personalAreaBtn = Array.from(document.querySelectorAll('button, a, span')).find(el => el.innerText && el.innerText.includes('אזור אישי'));
                let calendarCells = document.querySelector('.mat-calendar-body-cell');
                
                if (profileBtn || personalAreaBtn || calendarCells) {
                    return resolve({ type: 'already_logged_in' });
                }
                
                if (Date.now() - startTime > 20000) {
                    let text = document.body ? document.body.innerText.replace(/\n/g, ' ').substring(0, 100) : 'אין תוכן';
                    return reject(`לא זוהה מסך התחברות. טקסט נוכחי: "${text}..."`);
                }
                setTimeout(check, 500);
            };
            check();
        });

        if (state.type === 'already_logged_in') {
            if (config.forceLogout) {
                return { success: false, error: "ההתנתקות נכשלה! המערכת עדיין מזהה חשבון מחובר ולכן הריצה נעצרה." };
            }
            
            log("מזוהה חיבור קיים! מדלג על שלב האימות...");
            return { success: true };
        }

        log("מזין תעודת זהות...");
        utils.setNativeValue(state.el, config.tz);
        
        let loginBtn = document.querySelector('.button.primary-orange.login');
        if (!loginBtn) throw new Error("לא נמצא כפתור התחברות");
        loginBtn.click();

        log("ממתין לקוד מהמייל (זה עשוי לקחת עד דקה)...");
        let otpRes = await chrome.runtime.sendMessage({ type: "FETCH_OTP", url: config.gasUrl });
        if(!otpRes || !otpRes.success) throw new Error(otpRes ? otpRes.error : "שגיאה במשיכת המייל");
        
        log(`קוד התקבל! מזין לאתר...`);
        
        let digit0 = null;
        for (let i = 0; i < 20; i++) {
            digit0 = document.querySelector('#digit-0');
            if (digit0) break;
            await sleep(500);
        }
        if (!digit0) throw new Error("מסך הזנת הקוד לא נטען.");

        for(let i = 0; i < 6; i++) {
            let digit = document.querySelector(`#digit-${i}`);
            if (digit) utils.setNativeValue(digit, otpRes.code[i]);
        }

        let contBtns = Array.from(document.querySelectorAll('.button.primary-orange'));
        let contBtn = contBtns.find(b => b.innerText.includes('המשך') && !b.classList.contains('login'));
        if (contBtn) contBtn.click(); 
        
        return { success: true };
        
    } catch (err) {
        return { success: false, error: err.toString() };
    }
}

// שלב ב': דיווח מונה
async function injectMeterPhase(config) {
    const log = (msg, status="loading") => chrome.runtime.sendMessage({type: "PROGRESS", text: msg, status});
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const utils = {
        clearPopups: function() {
            try {
                let btns = document.querySelectorAll('button, a, [role="button"]');
                for (let b of btns) {
                    let txt = b.innerText.trim();
                    if (["לא תודה", "המשך לאתר", "לסגירה", "סגור", "X", "אישור", "הבנתי", "מסכים", "אני מאשר"].includes(txt)) {
                        b.click();
                    }
                }
                let icons = document.querySelectorAll('.close-modal, .close-btn, [aria-label="סגור"], [aria-label="Close"]');
                for (let icon of icons) icon.click();
            } catch (e) {}
        },
        setNativeValue: function(el, value) {
            const lastValue = el.value;
            el.value = value;
            const event = new Event("input", { bubbles: true });
            if (el._valueTracker) el._valueTracker.setValue(lastValue);
            el.dispatchEvent(event);
            el.dispatchEvent(new Event("change", { bubbles: true }));
        }
    };

    utils.clearPopups();

    if (document.querySelector('#identificationwizard-input')) {
        throw new Error("האתר חזר למסך ההתחברות. נסה להפעיל שוב.");
    }

    let dateWrapper = document.querySelector('mat-datepicker-toggle, #datepicker_wrapper');
    let anyContinueBtn = Array.from(document.querySelectorAll('.button.primary-orange')).find(b => b.innerText.includes('המשך') && !b.classList.contains('login'));

    if (!dateWrapper && !anyContinueBtn) {
        return { ready: false }; 
    }

    try {
        if (!dateWrapper && anyContinueBtn) {
            log("לוחץ על 'המשך' במסך הביניים...");
            anyContinueBtn.click();
            for(let i=0; i<10; i++) {
                await sleep(500);
                dateWrapper = document.querySelector('mat-datepicker-toggle, #datepicker_wrapper');
                if(dateWrapper) break;
            }
        }

        if (!dateWrapper) return { ready: false }; 

        let cells = document.querySelectorAll('.mat-calendar-body-cell');
        if (cells.length === 0) {
            log("פותח את לוח השנה...");
            let calendarBtn = document.querySelector('mat-datepicker-toggle button, button[aria-label*="calendar" i], button[aria-label*="יומן" i]');
            if (calendarBtn) calendarBtn.click();
            await sleep(1000);
            cells = document.querySelectorAll('.mat-calendar-body-cell');
        }

        log("בוחר את התאריך של היום...");
        let today = new Date().getDate().toString();
        let foundDate = false;
        
        for(let cell of cells) {
            let txt = cell.innerText.trim();
            if(txt === today || cell.querySelector('.mat-calendar-body-cell-content')?.innerText.trim() === today) {
                cell.click();
                foundDate = true;
                break;
            }
        }
        if(!foundDate) throw new Error(`לא נמצא התאריך הנוכחי (${today}) בלוח השנה.`);
        
        await sleep(1500);

        log("מחפש כפתור 'הקלדה וצירוף תמונה'...");
        let clickedType = false;
        for (let attempts = 0; attempts < 10; attempts++) {
            let buttons = document.querySelectorAll('button, a, [role="button"]');
            for(let btn of buttons) {
                if(btn.innerText && btn.innerText.includes("הקלדה וצירוף תמונה")) {
                    btn.click();
                    clickedType = true;
                    break;
                }
            }
            if (clickedType) break;
            await sleep(500);
        }
        if(!clickedType) throw new Error("כפתור הקלדה וצירוף תמונה לא נמצא.");

        log(`מזין מונה (${config.meter})...`);
        let meterInput = null;
        for (let attempts = 0; attempts < 10; attempts++) {
            meterInput = document.querySelector('#meter');
            if (meterInput) break;
            await sleep(500);
        }
        if(!meterInput) throw new Error("שדה מונה לא נמצא במסך.");
        
        utils.setNativeValue(meterInput, config.meter);
        
        await sleep(2000);

        if (config.testMode) {
            return { ready: true, success: true, keepOpen: true };
        } else {
            log("שולח נתונים סופיים...");
            let finalBtns = Array.from(document.querySelectorAll('.button.primary-orange'));
            let finalBtn = finalBtns.find(b => b.innerText.includes('המשך'));
            if(finalBtn) finalBtn.click();
            await sleep(4000); 
            return { ready: true, success: true };
        }
    } catch (err) {
        return { ready: true, success: false, error: err.toString() };
    }
}