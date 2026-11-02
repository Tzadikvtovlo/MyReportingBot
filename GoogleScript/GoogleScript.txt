function handleIecOtpRequest(e) {
  try {
    // חיפוש רק בדואר הנכנס (מתעלם ממיילים שהועברו לאשפה בעבר)
    var query = 'from:Hashmal103@iec.co.il newer_than:1d in:inbox';
    var otpCode = null;

    // מנסה 12 פעמים למצוא את המייל, עם המתנה של 5 שניות בין בדיקה לבדיקה (סה"כ עד דקה המתנה)
    for (var attempt = 0; attempt < 12; attempt++) {
      Utilities.sleep(5000); 
      var threads = GmailApp.search(query, 0, 1);
      
      if (threads.length > 0) {
        var thread = threads[0];
        var msgs = thread.getMessages();
        var lastMessage = msgs[msgs.length - 1];
        
        // מוודא שהמייל הגיע ב-5 הדקות האחרונות
        var now = new Date();
        if (now.getTime() - lastMessage.getDate().getTime() < 5 * 60 * 1000) {
          var body = lastMessage.getPlainBody();
          var match = body.match(/\b\d{6}\b/);
          if (match) {
            otpCode = match[0];
            // שורף את הקוד: מעביר את השרשור לאשפה כדי שלא ייקרא שוב בריצה הבאה
            thread.moveToTrash();
            break; // מצאנו! יוצאים מהלולאה
          }
        }
      }
    }

    if (otpCode) {
      return ContentService.createTextOutput(JSON.stringify({ success: true, code: otpCode })).setMimeType(ContentService.MimeType.JSON);
    } else {
      return ContentService.createTextOutput(JSON.stringify({ success: false, error: "לא נמצא קוד חדש במייל לאחר דקה של המתנה" })).setMimeType(ContentService.MimeType.JSON);
    }
  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({ success: false, error: error.toString() })).setMimeType(ContentService.MimeType.JSON);
  }
}

function testIecEmail() {
  var query = 'from:Hashmal103@iec.co.il newer_than:1d in:inbox';
  var threads = GmailApp.search(query, 0, 1);
  
  if (threads.length > 0) {
    var thread = threads[0];
    var messages = thread.getMessages();
    var lastMessage = messages[messages.length - 1];
    var body = lastMessage.getPlainBody();
    var match = body.match(/\b\d{6}\b/);
    
    console.log("=== תוכן המייל שנמצא ===");
    console.log(body);
    console.log("=== הקוד שחולץ ===");
    if (match) {
      console.log(match[0]);
      console.log("הערה: בריצה רגילה המייל הזה היה מועבר לאשפה כעת.");
      // פה אנחנו בטסט, אז לא מוחקים את המייל בפועל
    } else {
      console.log("לא נמצא קוד 6 ספרות!");
    }
  } else {
    console.log("לא נמצאו מיילים בתיבה (בדואר הנכנס) שמתאימים לחיפוש.");
  }
}