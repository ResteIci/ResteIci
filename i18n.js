// ═══════════════════════════════════════════════════════════════
// i18n — Multi-langue Support — ResteIci
// ═══════════════════════════════════════════════════════════════

const i18n = {
  currentLang: localStorage.getItem('lang') || 'fr',
  
  translations: {
    fr: {
      title: 'ResteIci — Tu n\'es pas seul(e)',
      heroTitle: 'Une communauté de soutien, sans jugement',
      heroCTA: 'Rejoindre',
      moreText: 'Commencer à écrire',
      about: 'Notre mission',
      emergency: 'En urgence ? Appelle 3114 (gratuit, 24/7)',
      encouragement: '💛 Encouragement',
      testimony: '📖 Témoignage',
      question: '💬 Question',
      reply: 'réponse',
      share: 'Partager',
      report: 'Signaler',
      noMessages: 'Aucun message ici pour l\'instant.\nSois le premier à écrire !',
      members: 'Membres',
      messages: 'Messages',
      reactions: 'Réactions',
    },
    en: {
      title: 'ResteIci — You are not alone',
      heroTitle: 'A supportive community, without judgment',
      heroCTA: 'Join',
      moreText: 'Start writing',
      about: 'Our Mission',
      emergency: 'In emergency? Call 3114 (free, 24/7)',
      encouragement: '💛 Encouragement',
      testimony: '📖 Testimony',
      question: '💬 Question',
      reply: 'reply',
      share: 'Share',
      report: 'Report',
      noMessages: 'No messages yet.\nBe the first to write!',
      members: 'Members',
      messages: 'Messages',
      reactions: 'Reactions',
    },
    es: {
      title: 'ResteIci — No estás solo/a',
      heroTitle: 'Una comunidad de apoyo, sin prejuicios',
      heroCTA: 'Únete',
      moreText: 'Empezar a escribir',
      about: 'Nuestra Misión',
      emergency: 'En emergencia? Llama 3114 (gratuito, 24/7)',
      encouragement: '💛 Aliento',
      testimony: '📖 Testimonio',
      question: '💬 Pregunta',
      reply: 'respuesta',
      share: 'Compartir',
      report: 'Reportar',
      noMessages: 'Sin mensajes aún.\n¡Sé el primero en escribir!',
      members: 'Miembros',
      messages: 'Mensajes',
      reactions: 'Reacciones',
    },
    de: {
      title: 'ResteIci — Du bist nicht allein',
      heroTitle: 'Eine unterstützende Gemeinschaft ohne Vorurteile',
      heroCTA: 'Beitreten',
      moreText: 'Anfangen zu schreiben',
      about: 'Unsere Mission',
      emergency: 'Im Notfall? Rufen Sie 3114 an (kostenlos, 24/7)',
      encouragement: '💛 Ermutigung',
      testimony: '📖 Zeugnis',
      question: '💬 Frage',
      reply: 'Antwort',
      share: 'Teilen',
      report: 'Melden',
      noMessages: 'Noch keine Nachrichten.\nSei der Erste, der schreibt!',
      members: 'Mitglieder',
      messages: 'Nachrichten',
      reactions: 'Reaktionen',
    }
  },

  t(key) {
    return this.translations[this.currentLang]?.[key] || this.translations.fr[key] || key;
  },

  setLang(lang) {
    this.currentLang = lang;
    localStorage.setItem('lang', lang);
  },

  getLang() {
    return this.currentLang;
  }
};

// Helper pour traduire tous les éléments
function translatePage() {
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n');
    el.textContent = i18n.t(key);
  });
}

// Changeur de langue
function setLanguage(lang) {
  i18n.setLang(lang);
  translatePage();
  document.documentElement.lang = lang;
}
