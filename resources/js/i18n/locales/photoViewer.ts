import type { Dict } from "../translations";

// The shared photo / file viewer: Download with confirm and success.
export const photoViewerTranslations: Dict = {
  confirmDownloadFileTitle: { en: "Download this file?", tl: "I-download ang file na ito?", ceb: "I-download kini nga file?" },
  confirmDownloadFileBody: { en: "This will save a copy of the file to your device.", tl: "Ise-save nito ang kopya ng file sa iyong device.", ceb: "I-save niini ang kopya sa file sa imong device." },
  downloadFileSuccessMessage: { en: "The file was downloaded successfully.", tl: "Matagumpay na na-download ang file.", ceb: "Malampuson nga na-download ang file." },
  downloadFileFailedMessage: { en: "Couldn't download the file. Please try again.", tl: "Hindi ma-download ang file. Subukan muli.", ceb: "Dili ma-download ang file. Sulayi pag-usab." },
  viewerPrevLabel: { en: "Previous", tl: "Nakaraan", ceb: "Nauna" },
  viewerNextLabel: { en: "Next", tl: "Susunod", ceb: "Sunod" },
};
