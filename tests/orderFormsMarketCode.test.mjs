import { twoLetterCode, twoLetterName, twoLetterLabel } from "../src/lib/orderForms/marketCode.js";
import { MAGI_TWO_LETTER, MAGI_MARKET_CODES } from "../src/constants.js";

check("three letters as MAGI's two", ["DEN", "chi", "GER", "NED", "RSA", "GBR", "VIE"].map(twoLetterCode), ["DK", "CL", "DE", "NL", "ZA", "UK", "VN"]);
check("language pairs, however they're punctuated", ["SUI-FR", "sui_de", "BEL-FL", "MENA_AR", "THA-ENG"].map(twoLetterCode), ["CH-FR", "CH-DE", "BE-FL", "ME-AR", "TH-ENG"]);
check("two letters, regions and codes MAGI doesn't pair stay", ["DK", "CIS", "LAS", "UAE", "IND", "TRI", "", "Xyz"].map(twoLetterCode), ["DK", "CIS", "LAS", "UAE", "IND", "TRI", "", "Xyz"]);
check("every pair is one country on MAGI's sheet",
  Object.entries(MAGI_TWO_LETTER).filter(([three, two]) => MAGI_MARKET_CODES[three] !== MAGI_MARKET_CODES[two]), []);

check("a name's closing code made two-letter",
  ["FIL_INTL_View_DINTH_MotionPoster_1080x1920px_10s_DEN", "A_B_10s_SUI_FR", "A_B_10s_BEL-FL", "A_B_10s_MENA_EN", "FIL - CHI"].map(twoLetterName),
  ["FIL_INTL_View_DINTH_MotionPoster_1080x1920px_10s_DK", "A_B_10s_CH_FR", "A_B_10s_BE-FL", "A_B_10s_ME_EN", "FIL - CL"]);
check("names already two-letter, or not ending in a market, are left alone",
  ["A_B_10s_DK", "A_B_10s_DK_V02", "A_B_CMYK", "EBZR_Teaser_TRI", "A_B_10s_CIS", "DEN"].map(twoLetterName),
  ["A_B_10s_DK", "A_B_10s_DK_V02", "A_B_CMYK", "EBZR_Teaser_TRI", "A_B_10s_CIS", "DEN"]);

check("a Drive folder's label shows two letters", ["Denmark (DEN)", "Chile (CHI)", "Georgia (CIS)", "Croatia"].map(twoLetterLabel),
  ["Denmark (DK)", "Chile (CL)", "Georgia (CIS)", "Croatia"]);
