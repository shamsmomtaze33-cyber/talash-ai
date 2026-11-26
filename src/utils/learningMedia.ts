import hadithImg from '../assets/images/islamic_hadith_manuscript_1795564402945.jpg';
import authenticDuasImg from '../assets/images/islamic_authentic_duas_1795564403617.jpg';
import leavingHomeImg from '../assets/images/islamic_leaving_home_1795564403967.jpg';
import quranSurahsImg from '../assets/images/islamic_quran_surahs_1795564404561.jpg';
import salahPrayerImg from '../assets/images/islamic_salah_prayer_1795564403892.jpg';
import afterSalahImg from '../assets/images/islamic_after_salah_1795564404325.jpg';
import taqwaGuidanceImg from '../assets/images/islamic_taqwa_guidance_1795564404710.jpg';
import writingsScrollImg from '../assets/images/islamic_writings_scroll_1795564404844.jpg';
import islamicKnowledgeImg from '../assets/images/islamic_knowledge_books_1795597768303.jpg';
import islamicHistoryImg from '../assets/images/islamic_history_architecture_1795597769098.jpg';
import islamicQaImg from '../assets/images/islamic_qa_study_1795597768252.jpg';
import type { LearningImageKey } from '../types/learning';

const IMAGE_MAP: Record<LearningImageKey, string> = {
  hadith: hadithImg,
  authentic_duas: authenticDuasImg,
  leaving_home: leavingHomeImg,
  quran_surahs: quranSurahsImg,
  salah_prayer: salahPrayerImg,
  after_salah: afterSalahImg,
  taqwa_guidance: taqwaGuidanceImg,
  writings_scroll: writingsScrollImg,
  islamic_knowledge: islamicKnowledgeImg,
  islamic_history: islamicHistoryImg,
  islamic_qa: islamicQaImg,
};

export function resolveLearningImage(key?: string): string {
  if (key && key in IMAGE_MAP) {
    return IMAGE_MAP[key as LearningImageKey];
  }
  return hadithImg;
}
