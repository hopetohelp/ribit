# ספריית רכיבי הממשק של הפלא השמיני

| רכיב | מקור משותף | שימוש |
| --- | --- | --- |
| ניווט וחזרה | [navigation.css](../web/app/navigation.css) | משתמשים ב־`.back-button`, `.brand-logo` ו־`.dialog-heading` במסכי האתר ובמחשבון. |
| חלון צף | [floating.js](../web/app/floating.js) · [floating.css](../web/app/floating.css) | משתמשים ב־`.floating-panel` למשטח וב־`RibitFloating.dismissOutside` לסגירה אחרי לחיצה שהתחילה והסתיימה בחוץ. לתפריט ממוקם משתמשים ב־`.floating-light-dismiss` עם אותו מנגנון סגירה. פקד הסגירה משתמש ב־`.back-button`. |
| תמיכה | [chat.html](../web/hosting/chat.html) · [chat.js](../web/hosting/chat.js) · [chat.css](../web/hosting/chat.css) | מסך הפתיחה ותפריט המחשבון מקשרים לאותו מסך מלא. הצ׳אט מזהה את מצב החשבון והחיבור ומציג הודעת מצב בהתאם. |
| מגירות וכפתורי פתיחה | [index.html](../web/hosting/index.html) · [preview.css](../web/hosting/preview.css) | משתמשים ב־`.primary` לכל כפתור מקביל, וב־`.entry-drawer` עם `.drawer-content` לתוכן נפתח. |
| חשבון | [account-panel.html](../web/account-panel.html) · [account.css](../web/hosting/account.css) | המגירה ועמוד החשבון חולקים את טופס הכניסה ופעולות היציאה והחלפת הסיסמה. פעולות מקבילות משתמשות ב־`.account-control` בתוך `.account-options`. |
| טפסים ופעולות במחשבון | [app.html](../web/app/app.html) · [app.css](../web/app/app.css) | משתמשים ב־`.field` לשדה עם תווית, `.actions` לקבוצת פעולות וב־`.primary` או `.outline` לפי ההיררכיה. |

בכל חלון ממקמים את המיקוד בתוכן או בפקד הסגירה, מאפשרים סגירה במקלדת, ומחזירים את המיקוד לפקד שפתח אותו. מוודאים שהלחיצה בתוך החלון אינה סוגרת אותו ושהחלון נגיש ברוחב נייד.
