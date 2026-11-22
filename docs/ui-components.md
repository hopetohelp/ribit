# ספריית רכיבי הממשק של הפלא השמיני

| רכיב | מקור משותף | שימוש |
| --- | --- | --- |
| ניווט ומיתוג | [navigation.css](../web/app/navigation.css) · [brand.svg](../web/app/brand.svg) | מסך הפתיחה והמחשבון משתמשים ב־`.brand-logo` עם לוגו משותף שצבעיו משתנים לפי המראה. |
| מראה בהיר וכהה | [theme.js](../web/app/theme.js) | מסך הפתיחה והמחשבון משתפים את בחירת המראה. כל עוד לא נשמרה בחירה, הם משתמשים בהגדרת המערכת. |
| חלון צף | [floating.js](../web/app/floating.js) · [floating.css](../web/app/floating.css) | משתמשים ב־`.floating-panel` למשטח וב־`RibitFloating.dismissOutside` לסגירה אחרי לחיצה שהתחילה והסתיימה בחוץ. לתפריט ממוקם משתמשים ב־`.floating-light-dismiss` עם אותו מנגנון סגירה. פקד הסגירה משתמש ב־`.dialog-close`. |
| תמיכה | [chat.html](../web/hosting/chat.html) · [chat.js](../web/hosting/chat.js) · [chat.css](../web/hosting/chat.css) | תפריט המחשבון מקשר למסך התמיכה. הצ׳אט מזהה את מצב החשבון והחיבור ומציג הודעת מצב בהתאם. |
| מגירות וכפתורי פתיחה | [index.html](../web/hosting/index.html) · [preview.css](../web/hosting/preview.css) | דף הבית משלב את המחשבון הקיים לצד מסך הפתיחה. משתמשים ב־`.primary` לכל כפתור מקביל, וב־`.entry-drawer` עם `.drawer-content` לתוכן נפתח. |
| חשבון | [account-panel.html](../web/account-panel.html) · [account.css](../web/hosting/account.css) | עמוד החשבון מציג את טופס הכניסה ופעולות היציאה והחלפת הסיסמה. פעולות מקבילות משתמשות ב־`.account-control` בתוך `.account-options`. |
| טפסים ופעולות במחשבון | [app.html](../web/app/app.html) · [app.css](../web/app/app.css) | משתמשים ב־`.field` לשדה עם תווית, `.actions` לקבוצת פעולות וב־`.primary` או `.outline` לפי ההיררכיה. תפריט פעולות וחלון שיתוף משתמשים בחלון הצף המשותף וב־`.dialog-actions` לפעולות מקבילות. |

בכל חלון ממקמים את המיקוד בתוכן או בפקד הסגירה, מאפשרים סגירה במקלדת, ומחזירים את המיקוד לפקד שפתח אותו. מוודאים שהלחיצה בתוך החלון אינה סוגרת אותו ושהחלון נגיש ברוחב נייד.
