import type { AppLanguage } from '../types';

/**
 * Detects whether a message is written primarily in Pashto or Arabic (Perso-Arabic script)
 * so UI alignment and text direction can switch cleanly between RTL (Pashto/Arabic)
 * and LTR (English or other languages).
 */
export function isPashtoText(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;

  // Pashto-specific Perso-Arabic letters (ټ, څ, ځ, ډ, ړ, ږ, ښ, ګ, ڼ, ې, ۍ, ی)
  const pashtoSpecificRegex =
    /[\u067C\u0681\u0685\u0689\u0693\u0696\u069A\u06AB\u06BC\u06CD\u06D0\u06CC]/;

  const arabicScriptMatches = trimmed.match(/[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]/g);
  if (!arabicScriptMatches || arabicScriptMatches.length === 0) {
    return false;
  }

  if (pashtoSpecificRegex.test(trimmed)) {
    return true;
  }

  const latinMatches = trimmed.match(/[A-Za-z]/g);
  return arabicScriptMatches.length >= (latinMatches?.length ?? 0);
}

export const isRtlText = isPashtoText;

export interface UiCopy {
  dir: 'ltr' | 'rtl';
  subtitle: string;
  newChat: string;
  hello: string;
  iAm: string;
  howHelp: string;
  typeMessage: string;
  askAnythingPlaceholder: string;
  navHome: string;
  navChat: string;
  navHistory: string;
  navSettings: string;
  navPremium: string;
  smarterFasterBetter: string;
  createdBy: string;
  askAnything: string;
  getIdeas: string;
  writeContent: string;
  learnSomething: string;
  translate: string;
  research: string;
  codingAssistant: string;
  imageCreation: string;
  chatHistory: string;
  renameChat: string;
  clearConversation: string;
  deleteChat: string;
}

const UI_COPY: Record<AppLanguage, UiCopy> = {
  en: {
    dir: 'ltr',
    subtitle: 'Your Intelligent AI Assistant',
    newChat: 'New Chat',
    hello: 'Hello! 👋',
    iAm: 'I am TALASH Ai.',
    howHelp: 'How can I help you today?',
    typeMessage: 'Type your message...',
    askAnythingPlaceholder: 'Ask TALASH Ai anything...',
    navHome: 'Home',
    navChat: 'Chat',
    navHistory: 'History',
    navSettings: 'Settings',
    navPremium: 'Premium',
    smarterFasterBetter: 'Smarter. Faster. Better.',
    createdBy: 'Created by: Shams Talash',
    askAnything: 'Ask Anything',
    getIdeas: 'Get Ideas',
    writeContent: 'Write Content',
    learnSomething: 'Learn Something',
    translate: 'Translate',
    research: 'Research',
    codingAssistant: 'Coding Assistant',
    imageCreation: 'Image Creation',
    chatHistory: 'Chat History',
    renameChat: 'Rename Chat',
    clearConversation: 'Clear Conversation',
    deleteChat: 'Delete Chat',
  },
  ps: {
    dir: 'rtl',
    subtitle: 'ستاسو هوښیار مصنوعي ذکاوت مرستیال',
    newChat: 'نوی چیټ',
    hello: 'سلام! 👋',
    iAm: 'زه TALASH Ai یم.',
    howHelp: 'نن ستاسو څه مرسته کولی شم؟',
    typeMessage: 'خپل پیغام دلته ولیکئ...',
    askAnythingPlaceholder: 'له TALASH Ai څخه هره پوښتنه وکړئ...',
    navHome: 'کور',
    navChat: 'چیټ',
    navHistory: 'تاریخچه',
    navSettings: 'تنظیمات',
    navPremium: 'پریمیم',
    smarterFasterBetter: 'هوښیار. چټک. غوره.',
    createdBy: 'جوړوونکی: شمس تلاش',
    askAnything: 'هره پوښتنه',
    getIdeas: 'نوی فکرونه',
    writeContent: 'لیکنه وکړئ',
    learnSomething: 'اسلامي زده کړه',
    translate: 'ژباړه',
    research: 'څېړنه',
    codingAssistant: 'کوډ مرستیال',
    imageCreation: 'انځور جوړول',
    chatHistory: 'د چیټ تاریخچه',
    renameChat: 'نوم بدلول',
    clearConversation: 'خبرې پاکول',
    deleteChat: 'چیټ حذفول',
  },
  ar: {
    dir: 'rtl',
    subtitle: 'مساعدك الذكي بالذكاء الاصطناعي',
    newChat: 'محادثة جديدة',
    hello: 'مرحباً! 👋',
    iAm: 'أنا TALASH Ai.',
    howHelp: 'كيف يمكنني مساعدتك اليوم؟',
    typeMessage: 'اكتب رسالتك هنا...',
    askAnythingPlaceholder: 'اسأل TALASH Ai أي شيء...',
    navHome: 'الرئيسية',
    navChat: 'المحادثة',
    navHistory: 'السجل',
    navSettings: 'الإعدادات',
    navPremium: 'بريميوم',
    smarterFasterBetter: 'أذكى. أسرع. أفضل.',
    createdBy: 'إعداد: شمس تلاش',
    askAnything: 'اسأل أي شيء',
    getIdeas: 'أفكار إبداعية',
    writeContent: 'كتابة المحتوى',
    learnSomething: 'تعلم شيئاً',
    translate: 'ترجمة فورية',
    research: 'بحث مباشر',
    codingAssistant: 'مساعد البرمجة',
    imageCreation: 'توليد الصور',
    chatHistory: 'سجل المحادثات',
    renameChat: 'إعادة التسمية',
    clearConversation: 'مسح المحادثة',
    deleteChat: 'حذف المحادثة',
  },
};

export function getUiCopy(lang: AppLanguage): UiCopy {
  return UI_COPY[lang] ?? UI_COPY.en;
}
