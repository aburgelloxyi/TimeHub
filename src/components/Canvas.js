import React, { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "../lib/supabaseClient";
import {
  Layout,
  Sparkles,
  X,
  ExternalLink,
  Plus,
  FileText,
  Film,
  Edit2,
  Trash2,
  Check,
  Link2,
  Copy,
  Folder,
  ImagePlus,
  Bold,
  Italic,
  Search,
  Command,
  Zap,
  Moon,
} from "lucide-react";

const INITIAL_CAMPAIGNS = [];

// --- THE HARDCODED COVER ART DICTIONARY ---
const CAMPAIGN_COVERS = {
  // Hardcoded initial campaign IDs
  "camp-ody":
    "https://m.media-amazon.com/images/M/MV5BN2MyYjk2MWMtODMyZS00MDUyLWE0OGQtOTQ3MGY0MDE0ZjVmXkEyXkFqcGc@._V1_.jpg",
  "camp-sm6":
    "https://img1.wsimg.com/isteam/ip/d6a3e7a7-e920-4711-bf09-856dd846af78/SCARYMOVIE6.webp",

  // Dynamically imported Wrike campaign IDs
  "wrike-disclosure-day":
    "https://cdn.theplaylist.net/wp-content/uploads/2025/12/16114819/discloure-day.jpg",
  "wrike-passenger":
    "https://m.media-amazon.com/images/M/MV5BNjFhNmVjY2MtNjNjMy00MDIwLThiMjMtY2VkMGQwZmRjMTI4XkEyXkFqcGc@._V1_.jpg",
  "wrike-the-super-mario-galaxy-movie":
    "https://cdn.mos.cms.futurecdn.net/w3k25CThDiiTSZpD7QM8xD.jpg",
};

// --- HELPER: Generate a unique gradient based on campaign title ---
const generateGradient = (title) => {
  let hash = 0;
  for (let i = 0; i < title.length; i++) {
    hash = title.charCodeAt(i) + ((hash << 5) - hash);
  }
  const h1 = Math.abs(hash % 360);
  const h2 = (h1 + 40) % 360;
  return `linear-gradient(135deg, hsl(${h1}, 80%, 65%), hsl(${h2}, 80%, 45%))`;
};

// --- HELPER: Markdown Parser for Notes ---
const parseFormatting = (text) => {
  if (!text) return "";
  let html = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>") // Bold
    .replace(/\*(.*?)\*/g, "<em>$1</em>") // Italic
    .replace(
      /\[([^\]]+)\]\(([^)]+)\)/g,
      '<a href="$2" target="_blank" rel="noopener noreferrer" style="color: #12a0e1; text-decoration: underline; font-weight: 700;">$1</a>'
    ) // Links
    .replace(/\n/g, "<br/>"); // Newlines
  return html;
};

export default function CampaignCanvas({ wrikeData = [], triggerToast: _triggerToast, isLoading = false }) {
  const triggerToast = _triggerToast ?? ((msg) => console.warn("Toast:", msg));
  const [campaigns, setCampaigns] = useState(INITIAL_CAMPAIGNS);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedMatrix, setSelectedMatrix] = useState(null);

  // --- COMMAND PALETTE STATE ---
  const [isPaletteOpen, setIsPaletteOpen] = useState(false);
  const [paletteSearch, setPaletteSearch] = useState("");

  // --- ACCORDION ANIMATION & SCROLL STATE ---
  const [expandedCampId, setExpandedCampId] = useState(null);
  const [closingCampId, setClosingCampId] = useState(null);
  const accordionRef = useRef(null);

  // --- SIDE PANEL STATE ---
  const [showFoldersPanel, setShowFoldersPanel] = useState(false);

  // --- Cover Art State (Persisted to Supabase so localStorage clears don't wipe it) ---
  const [covers, setCovers] = useState({});

  const [newCampaignTitle, setNewCampaignTitle] = useState("");
  const [newCampaignLink, setNewCampaignLink] = useState("");

  const [editingNote, setEditingNote] = useState({
    campId: null,
    noteId: null,
  });
  const [editNoteText, setEditNoteText] = useState("");
  const [addingNoteCampId, setAddingNoteCampId] = useState(null);
  const [newNoteText, setNewNoteText] = useState("");

  const [editingLink, setEditingLink] = useState({
    campId: null,
    linkId: null,
  });
  const [editLinkTitle, setEditLinkTitle] = useState("");
  const [editLinkUrl, setEditLinkUrl] = useState("");

  const [linkModalCampId, setLinkModalCampId] = useState(null);
  const [newLinkTitle, setNewLinkTitle] = useState("");
  const [newLinkUrl, setNewLinkUrl] = useState("");
  const [copiedLinkId, setCopiedLinkId] = useState(null);

  // Load covers from Supabase on mount
  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("canvas_covers").select("covers").eq("id", 1).single();
      if (data?.covers) setCovers(data.covers);
    })();
  }, []);

  // Save covers to Supabase whenever they change
  const saveCoverRef = useRef(null);
  useEffect(() => {
    if (Object.keys(covers).length === 0) return;
    clearTimeout(saveCoverRef.current);
    saveCoverRef.current = setTimeout(async () => {
      await supabase.from("canvas_covers").upsert({ id: 1, covers });
    }, 500);
  }, [covers]);

  // --- GLOBAL KEYBOARD LISTENER (CMD+K) ---
  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setIsPaletteOpen((prev) => !prev);
      }
      if (e.key === "Escape") {
        setIsPaletteOpen(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  useEffect(() => {
    if (!isPaletteOpen) setPaletteSearch("");
  }, [isPaletteOpen]);

  // --- SMART AUTO-SCROLL EFFECT ---
  useEffect(() => {
    if (expandedCampId && accordionRef.current) {
      const timer = setTimeout(() => {
        const yOffset = -40;
        const elementTop = accordionRef.current.getBoundingClientRect().top;
        const targetPosition = elementTop + window.scrollY + yOffset;
        window.scrollTo({ top: targetPosition, behavior: "smooth" });
      }, 350);

      return () => clearTimeout(timer);
    }
  }, [expandedCampId]);

  useEffect(() => {
    if (!wrikeData || wrikeData.length === 0) return;

    const wrikeGroupedCampaigns = {};

    wrikeData.forEach((task) => {
      let campaignTitle = task.projectName;

      // --- BULLETPROOF CAMPAIGN TITLE EXTRACTOR ---
      if (!campaignTitle || campaignTitle === "Unknown Project") {
        // 1. Try to extract the movie name from the folder path (e.g. .../Disclosure Day/Digital/...)
        if (task.extractedPathData) {
          const pathParts = task.extractedPathData.split("/");
          const digitalIndex = pathParts.findIndex(
            (p) => p.toUpperCase() === "DIGITAL"
          );
          if (digitalIndex > 0) {
            campaignTitle = pathParts[digitalIndex - 1];
          }
        }

        // 2. If still missing, guess from the acronym in the title
        if (!campaignTitle || campaignTitle.trim() === "") {
          const prefix = task.title.split("_")[0].toUpperCase();
          if (prefix === "DDA") campaignTitle = "Disclosure Day";
          else if (prefix === "ODY") campaignTitle = "The Odyssey";
          else if (prefix === "SCRY") campaignTitle = "Scary Movie 6";
          else campaignTitle = task.title.split(/[-_]/)[0] || "Unknown Project";
        }
      }

      // Clean up any weird URL encoding or underscores
      campaignTitle = decodeURIComponent(campaignTitle)
        .replace(/_/g, " ")
        .trim();

      if (!wrikeGroupedCampaigns[campaignTitle]) {
        wrikeGroupedCampaigns[campaignTitle] = {
          id: `wrike-${campaignTitle.toLowerCase().replace(/\s+/g, "-")}`,
          title: campaignTitle,
          wrikeLink: task.permalink || "#",
          notes: [],
          matrices: [],
          links: [],
        };
      }

      const tableHtml = task.tableHtml || "";
      const notesText = task.notesText || "";
      const extractedPath = task.extractedPathData || "";

      const finalNoteText =
        notesText || `Connected Matrix Asset: ${task.title}`;
      if (
        !wrikeGroupedCampaigns[campaignTitle].notes.some(
          (n) => n.text === finalNoteText
        )
      ) {
        wrikeGroupedCampaigns[campaignTitle].notes.push({
          id: `note-wrike-${task.id}`,
          text: finalNoteText,
          isAutoGenerated: true,
        });
      }

      if (extractedPath) {
        const paths = extractedPath
          .split(" ")
          .filter((p) => p.includes("/VOLUMES/"));
        paths.forEach((pathStr, index) => {
          if (
            !wrikeGroupedCampaigns[campaignTitle].links.some(
              (l) => l.url === pathStr
            )
          ) {
            const parts = pathStr.split("/").filter(Boolean);
            const last2 = parts.slice(-2).map((s) => decodeURIComponent(s).replace(/_/g, " ")).join(" / ");
            wrikeGroupedCampaigns[campaignTitle].links.push({
              id: `link-auto-${task.id}-${index}`,
              title: last2 || pathStr,
              url: pathStr,
              isAutoGenerated: true,
            });
          }
        });
      }

      if (
        tableHtml &&
        !wrikeGroupedCampaigns[campaignTitle].matrices.some(
          (m) => m.id === task.id
        )
      ) {
        wrikeGroupedCampaigns[campaignTitle].matrices.push({
          id: task.id,
          title: task.title,
          tableHtml: tableHtml,
        });
      }
    });

    setCampaigns((prevCampaigns) => {
      const updatedList = [...prevCampaigns];

      Object.values(wrikeGroupedCampaigns).forEach((wrikeCamp) => {
        const existingIndex = updatedList.findIndex(
          (c) => c.title.toLowerCase() === wrikeCamp.title.toLowerCase()
        );

        if (existingIndex > -1) {
          const existingNotes = updatedList[existingIndex].notes || [];
          wrikeCamp.notes.forEach((newNote) => {
            if (!existingNotes.some((en) => en.text === newNote.text)) {
              existingNotes.push(newNote);
            }
          });
          updatedList[existingIndex].notes = existingNotes;

          const existingLinks = updatedList[existingIndex].links || [];
          wrikeCamp.links.forEach((newLink) => {
            if (!existingLinks.some((el) => el.url === newLink.url)) {
              existingLinks.push(newLink);
            }
          });
          updatedList[existingIndex].links = existingLinks;

          updatedList[existingIndex].matrices = wrikeCamp.matrices;
          if (updatedList[existingIndex].wrikeLink === "#") {
            updatedList[existingIndex].wrikeLink = wrikeCamp.wrikeLink;
          }
        } else {
          updatedList.push(wrikeCamp);
        }
      });

      return updatedList;
    });
  }, [wrikeData]);

  // --- COMMAND PALETTE SEARCH ENGINE WITH ACTIONS ---
  const paletteResults = React.useMemo(() => {
    if (!paletteSearch.trim()) return [];
    const query = paletteSearch.toLowerCase();
    const results = [];

    const globalActions = [
      {
        id: "action-new",
        title: "Create New Campaign",
        matchType: "Action",
        icon: Plus,
      },
      {
        id: "action-copy",
        title: "Copy Canvas JSON to Clipboard",
        matchType: "Action",
        icon: Copy,
      },
      {
        id: "action-dark",
        title: "Toggle Dark Theme",
        matchType: "Action",
        icon: Moon,
      },
      {
        id: "action-sync",
        title: "Trigger API Sync",
        matchType: "Action",
        icon: Zap,
      },
    ];

    globalActions.forEach((action) => {
      if (action.title.toLowerCase().includes(query)) {
        results.push(action);
      }
    });

    campaigns.forEach((camp) => {
      let matched = false;
      let matchType = "";

      if (camp.title.toLowerCase().includes(query)) {
        matched = true;
        matchType = "Found in Title";
      } else if (camp.notes.some((n) => n.text.toLowerCase().includes(query))) {
        matched = true;
        matchType = "Found in Notes";
      } else if (
        camp.links.some(
          (l) =>
            l.title.toLowerCase().includes(query) ||
            l.url.toLowerCase().includes(query)
        )
      ) {
        matched = true;
        matchType = "Found in Folder Links";
      }

      if (matched) {
        results.push({ ...camp, matchType });
      }
    });

    return results;
  }, [paletteSearch, campaigns]);

  const handleSelectPaletteResult = (result) => {
    setIsPaletteOpen(false);
    setPaletteSearch("");

    if (result.matchType === "Action") {
      if (result.id === "action-new") setIsModalOpen(true);
      if (result.id === "action-copy") {
        navigator.clipboard.writeText(JSON.stringify(campaigns, null, 2));
        triggerToast("Canvas data copied to clipboard!", "success");
      }
      if (result.id === "action-dark") {
        document.documentElement.classList.toggle("dark-theme");
      }
      if (result.id === "action-sync") {
        triggerToast("Wrike Sync triggered! (Placeholder)");
      }
      return;
    }

    handleToggleCamp(result.id);
  };

  // --- REBUILT "BREATHE" ACCORDION TOGGLE (WITH ANCHORING) ---
  const handleToggleCamp = (id) => {
    const anchorScrollTop = () => {
      if (accordionRef.current) {
        const yOffset = -40;
        const elementTop = accordionRef.current.getBoundingClientRect().top;
        window.scrollTo({
          top: elementTop + window.scrollY + yOffset,
          behavior: "smooth",
        });
      }
    };

    if (expandedCampId === id) {
      anchorScrollTop();
      setClosingCampId(id);
      setExpandedCampId(null);
      setTimeout(() => {
        setClosingCampId(null);
        setShowFoldersPanel(false);
      }, 400);
    } else if (expandedCampId) {
      anchorScrollTop();
      setClosingCampId(expandedCampId);
      setExpandedCampId(null);
      setShowFoldersPanel(false);

      setTimeout(() => {
        setClosingCampId(null);
        setExpandedCampId(id);
      }, 400);
    } else {
      setExpandedCampId(id);
      setClosingCampId(null);
      setShowFoldersPanel(false);
    }
  };

  const activeCampId = expandedCampId || closingCampId;
  const activeCamp = activeCampId
    ? campaigns.find((c) => c.id === activeCampId)
    : null;
  const activeCover = activeCamp
    ? covers[activeCamp.id] || CAMPAIGN_COVERS[activeCamp.id]
    : null;

  const handleSaveNewCampaign = () => {
    if (!newCampaignTitle.trim()) return;
    const newCampaign = {
      id: `camp-${Date.now()}`,
      title: newCampaignTitle,
      wrikeLink: newCampaignLink || "#",
      notes: [],
      matrices: [],
      links: [],
    };
    setCampaigns([...campaigns, newCampaign]);
    handleCloseModal();
  };

  const handleCloseModal = () => {
    setNewCampaignTitle("");
    setNewCampaignLink("");
    setIsModalOpen(false);
  };

  const handleFormat = (type, textState, setTextState, inputId) => {
    const textarea = document.getElementById(inputId);
    if (!textarea) return;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selectedText = textState.substring(start, end);
    let before = textState.substring(0, start);
    let after = textState.substring(end);

    let prefix = "";
    let suffix = "";

    if (type === "bold") {
      prefix = "**";
      suffix = "**";
    }
    if (type === "italic") {
      prefix = "*";
      suffix = "*";
    }
    if (type === "link") {
      const url = prompt("Enter link URL:");
      if (!url) return;
      prefix = "[";
      suffix = `](${url})`;
    }

    const defaultText =
      selectedText || (type === "link" ? "link text" : "text");
    const newText = before + prefix + defaultText + suffix + after;

    setTextState(newText);

    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(
        start + prefix.length,
        start + prefix.length + defaultText.length
      );
    }, 0);
  };

  const handleAddNote = (campId) => {
    if (!newNoteText.trim()) return;
    setCampaigns((prev) =>
      prev.map((camp) => {
        if (camp.id === campId) {
          return {
            ...camp,
            notes: [
              ...(camp.notes || []),
              { id: `note-${Date.now()}`, text: newNoteText },
            ],
          };
        }
        return camp;
      })
    );
    setNewNoteText("");
    setAddingNoteCampId(null);
  };

  const handleDeleteNote = (campId, noteId) => {
    setCampaigns((prev) =>
      prev.map((camp) => {
        if (camp.id === campId) {
          return { ...camp, notes: camp.notes.filter((n) => n.id !== noteId) };
        }
        return camp;
      })
    );
  };

  const startEditing = (campId, note, text) => {
    setEditingNote({ campId, noteId: note.id });
    setEditNoteText(text);
  };

  const handleSaveEdit = (campId, noteId) => {
    if (!editNoteText.trim()) return;
    setCampaigns((prev) =>
      prev.map((camp) => {
        if (camp.id === campId) {
          return {
            ...camp,
            notes: camp.notes.map((n) =>
              n.id === noteId ? { ...n, text: editNoteText } : n
            ),
          };
        }
        return camp;
      })
    );
    setEditingNote({ campId: null, noteId: null });
  };

  const handleAddLink = (campId) => {
    if (!newLinkTitle.trim() || !newLinkUrl.trim()) return;
    setCampaigns((prev) =>
      prev.map((camp) => {
        if (camp.id === campId) {
          return {
            ...camp,
            links: [
              ...(camp.links || []),
              {
                id: `link-${Date.now()}`,
                title: newLinkTitle,
                url: newLinkUrl,
              },
            ],
          };
        }
        return camp;
      })
    );
    setNewLinkTitle("");
    setNewLinkUrl("");
  };
  const startEditingLink = (campId, link) => {
    setEditingLink({ campId, linkId: link.id });
    setEditLinkTitle(link.title);
    setEditLinkUrl(link.url);
  };

  const handleSaveEditLink = (campId, linkId) => {
    if (!editLinkTitle.trim() || !editLinkUrl.trim()) return;
    setCampaigns((prev) =>
      prev.map((camp) => {
        if (camp.id === campId) {
          return {
            ...camp,
            links: (camp.links || []).map((l) =>
              l.id === linkId
                ? { ...l, title: editLinkTitle, url: editLinkUrl }
                : l
            ),
          };
        }
        return camp;
      })
    );
    setEditingLink({ campId: null, linkId: null });
  };

  const cancelEditingLink = () => {
    setEditingLink({ campId: null, linkId: null });
  };
  const handleDeleteLink = (campId, linkId) => {
    setCampaigns((prev) =>
      prev.map((camp) => {
        if (camp.id === campId) {
          return {
            ...camp,
            links: (camp.links || []).filter((l) => l.id !== linkId),
          };
        }
        return camp;
      })
    );
  };

  const handleCopyLink = (url, linkId) => {
    navigator.clipboard.writeText(url);
    setCopiedLinkId(linkId);
    setTimeout(() => setCopiedLinkId(null), 2000);
  };

  const handleUpdateCover = (campId) => {
    const url = prompt(
      "Paste the image URL for this campaign's cover art (or leave blank to reset):"
    );
    if (url !== null) {
      setCovers((prev) => {
        const newCovers = { ...prev };
        if (url.trim() === "") {
          delete newCovers[campId];
        } else {
          newCovers[campId] = url;
        }
        return newCovers;
      });
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 text-[#122027] font-sans selection:bg-[#12a0e1]/30 selection:text-[#122027] pb-12">
      <style>{`
        /* --- SMOOTH ACCORDION ANIMATIONS --- */
        @keyframes accordionOpen {
          0% { opacity: 0; max-height: 0; margin-top: -2rem; margin-bottom: 0; transform: scaleY(0.95); transform-origin: top; }
          100% { opacity: 1; max-height: 1200px; margin-top: 1rem; margin-bottom: 3rem; transform: scaleY(1); transform-origin: top; }
        }
        @keyframes accordionClose {
          0% { opacity: 1; max-height: 1200px; margin-top: 1rem; margin-bottom: 3rem; transform: scaleY(1); transform-origin: top; }
          100% { opacity: 0; max-height: 0; margin-top: -2rem; margin-bottom: 0; transform: scaleY(0.95); transform-origin: top; }
        }
        .animate-accordion-open {
          animation: accordionOpen 0.5s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }
        .animate-accordion-close {
          animation: accordionClose 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }

        /* --- STANDARD STYLES --- */
        .wrike-matrix-render table { width: 100%; border-collapse: collapse; margin-top: 4px; font-size: 13px; }
        .wrike-matrix-render th { background-color: #122027; color: #ffffff; font-weight: 800; padding: 10px 14px; text-align: left; border: 1px solid #dce4ec; text-transform: uppercase; font-size: 11px; tracking: 0.05em; }
        .wrike-matrix-render td { padding: 10px 14px; border: 1px solid #dce4ec; font-weight: 500; color: #323b43; }
        .wrike-matrix-render tr:nth-child(even) { background-color: #f8fafc; }
        .wrike-matrix-render tr:hover { background-color: #12a0e1/5; }
        .wrike-matrix-render a { color: #12a0e1; font-weight: 700; text-decoration: underline; }
        .custom-scrollbar::-webkit-scrollbar { width: 6px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background-color: #dce4ec; border-radius: 10px; }
        .custom-scrollbar:hover::-webkit-scrollbar-thumb { background-color: #cbd5e1; }
      `}</style>

      {/* --- COMMAND PALETTE OVERLAY (z-300) --- */}
      {isPaletteOpen && (
        <div
          className="fixed inset-0 z-[300] flex items-start justify-center pt-[15vh] p-4 bg-[#122027]/60 backdrop-blur-sm animate-in fade-in duration-200"
          onClick={() => setIsPaletteOpen(false)}
        >
          <div
            className="bg-white rounded-3xl w-full max-w-2xl shadow-2xl flex flex-col border border-[#dce4ec] overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-4 border-b border-[#dce4ec] flex items-center gap-3 bg-slate-50/50">
              <Search className="w-6 h-6 text-[#12a0e1]" />
              <input
                autoFocus
                type="text"
                value={paletteSearch}
                onChange={(e) => setPaletteSearch(e.target.value)}
                placeholder="Search campaigns, notes, or quick actions..."
                className="flex-1 bg-transparent text-lg font-medium text-[#122027] outline-none placeholder:text-[#768994]"
              />
              <div className="text-[10px] font-black text-[#768994] bg-white px-2 py-1 rounded-md border border-[#dce4ec] shadow-sm">
                ESC
              </div>
            </div>

            <div className="max-h-[60vh] overflow-y-auto custom-scrollbar p-2">
              {!paletteSearch.trim() ? (
                <div className="p-10 text-center text-[#768994] flex flex-col items-center gap-2">
                  <Command className="w-8 h-8 opacity-30" />
                  <p className="text-sm font-medium">
                    Search for campaigns or trigger global actions...
                  </p>
                </div>
              ) : paletteResults.length === 0 ? (
                <div className="p-10 text-center text-[#768994] flex flex-col items-center gap-2">
                  <Search className="w-8 h-8 opacity-30" />
                  <p className="text-sm font-medium">
                    No matches found for "{paletteSearch}"
                  </p>
                </div>
              ) : (
                paletteResults.map((result) => {
                  const isAction = result.matchType === "Action";
                  const ActionIcon = result.icon;
                  const cover = !isAction
                    ? covers[result.id] || CAMPAIGN_COVERS[result.id]
                    : null;

                  return (
                    <button
                      key={result.id}
                      onClick={() => handleSelectPaletteResult(result)}
                      className="w-full text-left p-4 hover:bg-slate-50 rounded-2xl flex items-center justify-between group transition-colors"
                    >
                      <div className="flex items-center gap-4">
                        <div
                          className={`w-12 h-12 rounded-[1rem] overflow-hidden shadow-sm shrink-0 flex items-center justify-center border border-slate-100/50 ${
                            isAction ? "bg-amber-100 text-amber-600" : ""
                          }`}
                          style={{
                            background: !isAction
                              ? cover
                                ? "#fff"
                                : generateGradient(result.title)
                              : undefined,
                          }}
                        >
                          {isAction ? (
                            <ActionIcon className="w-6 h-6" />
                          ) : cover ? (
                            <img
                              src={cover}
                              className="w-full h-full object-cover"
                              alt=""
                            />
                          ) : (
                            <Film className="w-5 h-5 text-white opacity-90" />
                          )}
                        </div>
                        <div>
                          <h4 className="text-base font-black text-[#122027] group-hover:text-[#12a0e1] tracking-tight transition-colors">
                            {result.title}
                          </h4>
                          <p
                            className={`text-[11px] font-bold mt-0.5 flex items-center gap-1.5 uppercase tracking-widest ${
                              isAction ? "text-amber-500" : "text-[#768994]"
                            }`}
                          >
                            {isAction ? (
                              <Zap className="w-3 h-3" />
                            ) : (
                              <Sparkles className="w-3 h-3 text-[#1cc1a5]" />
                            )}
                            {result.matchType}
                          </p>
                        </div>
                      </div>
                      <span className="text-[10px] font-black uppercase tracking-widest text-[#768994] bg-white border border-slate-200 px-2.5 py-1.5 rounded-lg group-hover:text-[#12a0e1] group-hover:border-[#12a0e1]/30 group-hover:bg-[#12a0e1]/5 transition-colors flex items-center gap-1.5 shadow-sm">
                        {isAction ? "Run" : "Jump"}{" "}
                        <Layout className="w-3.5 h-3.5" />
                      </span>
                    </button>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}

      <div className="max-w-[1800px] mx-auto px-4 sm:px-6 pt-8 space-y-6">
        <header className="bg-white shadow-sm border border-[#dce4ec] rounded-[2rem] p-6 sm:px-8 flex flex-col md:flex-row items-start md:items-center justify-between gap-5 relative overflow-hidden">
          <div className="flex items-center gap-4">
            <div className="bg-gradient-to-br from-[#12a0e1] to-[#1cc1a5] p-3.5 rounded-2xl text-white shadow-lg shadow-[#12a0e1]/20">
              <Layout className="w-8 h-8" />
            </div>
            <div>
              <h1 className="text-3xl font-black text-[#122027] tracking-tight">
                Campaign Canvas
              </h1>
              <div className="text-[#768994] text-sm font-medium mt-0.5 flex items-center gap-2">
                Visual Command Centre for active campaigns
                <span className="hidden md:flex items-center gap-1 bg-slate-50 px-2 py-0.5 rounded-md text-[10px] font-black tracking-widest border border-[#dce4ec] shadow-sm text-[#768994] ml-2">
                  <Command className="w-3 h-3" /> Global Cmd + K Menu
                </span>
              </div>
            </div>
          </div>
          <button
            onClick={() => setIsModalOpen(true)}
            className="flex items-center justify-center gap-2 bg-[#122027] hover:bg-[#1a2d37] text-white px-6 py-3 rounded-xl font-bold transition-all shadow-md active:scale-95 sm:w-auto w-full"
          >
            <Sparkles className="w-4 h-4 text-white" />
            New Campaign
          </button>
        </header>

        {/* --- PERFECTLY CENTERED ICON DOCK --- */}
        {isLoading && (
          <div className="flex items-center justify-center gap-2 py-3 text-xs font-bold text-[#768994]">
            <div className="w-3.5 h-3.5 border-2 border-[#12a0e1] border-t-transparent rounded-full animate-spin" />
            Loading campaigns from cache…
          </div>
        )}
        <div className="flex flex-wrap justify-center gap-8 sm:gap-12 py-10 px-4 max-w-5xl mx-auto">
          {campaigns.map((camp) => {
            const hasCover = covers[camp.id] || CAMPAIGN_COVERS[camp.id];
            const isExpanded = expandedCampId === camp.id;

            return (
              <button
                key={camp.id}
                onClick={() => handleToggleCamp(camp.id)}
                className="group flex flex-col items-center w-28 sm:w-36 gap-3 transition-all outline-none shrink-0"
              >
                <div
                  className={`w-24 h-24 sm:w-32 sm:h-32 rounded-[2.5rem] shadow-md transition-all duration-300 border border-slate-100/50 flex flex-col items-center justify-center relative overflow-hidden ${
                    isExpanded
                      ? "ring-4 ring-[#12a0e1] ring-offset-4 ring-offset-slate-100 scale-105"
                      : "group-hover:shadow-2xl group-hover:-translate-y-2"
                  }`}
                  style={{
                    background: hasCover
                      ? "#fff"
                      : generateGradient(camp.title),
                  }}
                >
                  {hasCover ? (
                    <>
                      <img
                        src={hasCover}
                        alt={camp.title}
                        className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                      />
                    </>
                  ) : (
                    <div className="text-white group-hover:scale-110 transition-transform duration-300 drop-shadow-md">
                      <Film className="w-8 h-8 sm:w-10 sm:h-10 opacity-90" />
                    </div>
                  )}
                </div>
                <span
                  className={`text-sm font-bold text-center line-clamp-2 leading-snug transition-colors ${
                    isExpanded
                      ? "text-[#12a0e1]"
                      : "text-[#122027] group-hover:text-[#12a0e1]"
                  }`}
                >
                  {camp.title}
                </span>
              </button>
            );
          })}
        </div>

        {/* --- THE MASTER ACCORDION --- */}
        <div
          ref={accordionRef}
          className={`w-full max-w-8xl mx-auto grid transition-all duration-500 ease-[cubic-bezier(0.4,0,0.32,1)] ${
            expandedCampId || closingCampId
              ? "grid-rows-[1fr] opacity-100 mb-12"
              : "grid-rows-[0fr] opacity-0 mb-0 pointer-events-none"
          }`}
        >
          <div className="overflow-visible">
            {activeCamp && (
              <div
                className={`bg-white rounded-[2rem] w-full shadow-2xl flex flex-col border border-[#dce4ec] relative h-[80vh] min-h-[500px] transition-all duration-500 ease-out ${
                  closingCampId
                    ? "animate-accordion-close"
                    : "animate-accordion-open"
                }`}
              >
                {/* Dynamic Banner Header */}
                <div
                  className="h-40 sm:h-56 w-full relative shrink-0 flex items-end p-6 sm:p-8 rounded-t-[2rem] overflow-hidden"
                  style={{
                    background: activeCover
                      ? "#122027"
                      : generateGradient(activeCamp.title),
                  }}
                >
                  {activeCover && (
                    <>
                      <img
                        src={activeCover}
                        className="absolute inset-0 w-full h-full object-cover opacity-60"
                        alt="Banner"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-[#122027] via-[#122027]/40 to-transparent"></div>
                    </>
                  )}

                  <div className="relative z-10 w-full flex justify-between items-end gap-4">
                    <div className="flex items-end gap-4 sm:gap-6">
                      <div className="hidden sm:flex p-4 bg-white/10 backdrop-blur-md rounded-3xl text-white border border-white/20 shadow-xl relative">
                        <Film className="w-8 h-8" />
                      </div>
                      <div>
                        <h2 className="text-3xl sm:text-4xl font-black text-white tracking-tight drop-shadow-md leading-none mb-1">
                          {activeCamp.title}
                        </h2>
                        <p className="text-xs font-bold text-white/70 uppercase tracking-widest flex items-center gap-2 mt-1">
                          Campaign Command Centre
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleUpdateCover(activeCamp.id);
                            }}
                            className="px-2 py-1 bg-white/10 hover:bg-white/20 rounded-md transition-colors text-[9px] flex items-center gap-1 border border-white/10 ml-2"
                          >
                            <ImagePlus className="w-3 h-3" /> Edit Cover
                          </button>
                        </p>
                      </div>
                    </div>

                    <button
                      onClick={() => handleToggleCamp(activeCamp.id)}
                      className="p-2.5 bg-white/10 hover:bg-white/20 text-white rounded-full transition-colors backdrop-blur-md border border-white/20 mb-2 sm:mb-0"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>
                </div>

                {/* --- SEAMLESS SPLIT-PANE BODY --- */}
                <div className="p-6 sm:p-8 flex flex-col lg:flex-row gap-6 flex-1 overflow-hidden">
                  {/* LEFT PANE: Notes & Context */}
                  <div className="flex-1 flex flex-col h-full overflow-hidden min-w-0 transition-all duration-500">
                    <div className="flex justify-between items-center mb-5 pb-4 border-b border-slate-100 shrink-0">
                      <h4 className="text-sm font-black text-[#122027] flex items-center gap-2">
                        <FileText className="w-5 h-5 text-[#12a0e1]" /> Notes &
                        Context
                      </h4>
                      <div className="flex items-center gap-2 pr-2">
                        <button
                          onClick={() => setShowFoldersPanel((prev) => !prev)}
                          className={`px-4 py-2 rounded-xl transition-colors flex items-center gap-2 text-xs font-bold border ${
                            showFoldersPanel
                              ? "bg-indigo-100 text-indigo-700 border-indigo-200"
                              : "text-indigo-600 bg-indigo-50 hover:bg-indigo-100 border-indigo-100"
                          }`}
                        >
                          <Folder className="w-4 h-4" />{" "}
                          {(activeCamp.links || []).length} Folders
                        </button>
                        <button
                          onClick={() => {
                            setAddingNoteCampId(activeCamp.id);
                            setNewNoteText("");
                          }}
                          className="text-white bg-[#12a0e1] hover:bg-[#0f88c0] px-4 py-2 rounded-xl transition-colors flex items-center gap-2 text-xs font-bold shadow-sm"
                        >
                          <Plus className="w-4 h-4" /> Add Note
                        </button>
                      </div>
                    </div>

                    <div className="flex-1 overflow-y-auto pr-4 custom-scrollbar space-y-5 min-w-0">
                      {(activeCamp.notes || []).length === 0 &&
                        addingNoteCampId !== activeCamp.id && (
                          <div className="h-full flex flex-col items-center justify-center text-center opacity-50 py-10">
                            <FileText className="w-12 h-12 text-slate-400 mb-3" />
                            <p className="text-sm font-bold text-[#122027]">
                              No notes recorded.
                            </p>
                            <p className="text-xs text-[#768994] mt-1">
                              Click 'Add Note' to start tracking details.
                            </p>
                          </div>
                        )}

                      {(activeCamp.notes || []).map((note) => (
                        <div
                          key={note.id}
                          className="group/note relative border-b border-slate-100 last:border-0 pb-5 mb-5 last:pb-0 last:mb-0"
                        >
                          {editingNote.campId === activeCamp.id &&
                          editingNote.noteId === note.id ? (
                            <div className="flex flex-col gap-3 bg-slate-50 p-4 rounded-2xl border border-slate-200">
                              <div className="flex gap-1.5 border-b border-slate-200 pb-2">
                                <button
                                  onClick={() =>
                                    handleFormat(
                                      "bold",
                                      editNoteText,
                                      setEditNoteText,
                                      "edit-note-textarea"
                                    )
                                  }
                                  className="p-1.5 hover:bg-slate-200 rounded text-slate-600 transition-colors"
                                  title="Bold"
                                >
                                  <Bold className="w-4 h-4" />
                                </button>
                                <button
                                  onClick={() =>
                                    handleFormat(
                                      "italic",
                                      editNoteText,
                                      setEditNoteText,
                                      "edit-note-textarea"
                                    )
                                  }
                                  className="p-1.5 hover:bg-slate-200 rounded text-slate-600 transition-colors"
                                  title="Italic"
                                >
                                  <Italic className="w-4 h-4" />
                                </button>
                                <button
                                  onClick={() =>
                                    handleFormat(
                                      "link",
                                      editNoteText,
                                      setEditNoteText,
                                      "edit-note-textarea"
                                    )
                                  }
                                  className="p-1.5 hover:bg-slate-200 rounded text-slate-600 transition-colors"
                                  title="Add Link"
                                >
                                  <Link2 className="w-4 h-4" />
                                </button>
                              </div>
                              <div className="flex gap-3 items-start">
                                <textarea
                                  id="edit-note-textarea"
                                  autoFocus
                                  value={editNoteText}
                                  onChange={(e) =>
                                    setEditNoteText(e.target.value)
                                  }
                                  className="w-full text-sm text-[#122027] bg-transparent border-none resize-y min-h-[150px] outline-none focus:ring-0 p-0 leading-relaxed custom-scrollbar"
                                  rows="8"
                                />
                                <div className="flex flex-col gap-2 shrink-0">
                                  <button
                                    onClick={() =>
                                      handleSaveEdit(activeCamp.id, note.id)
                                    }
                                    className="p-2 bg-[#1cc1a5] text-white rounded-xl hover:bg-[#15a38b] shadow-sm transition-all"
                                  >
                                    <Check className="w-4 h-4" />
                                  </button>
                                  <button
                                    onClick={() =>
                                      setEditingNote({
                                        campId: null,
                                        noteId: null,
                                      })
                                    }
                                    className="p-2 bg-slate-200 text-[#768994] rounded-xl hover:bg-slate-300 transition-all"
                                  >
                                    <X className="w-4 h-4" />
                                  </button>
                                </div>
                              </div>
                            </div>
                          ) : (
                            <div className="flex justify-between items-start gap-6">
                              <div className="flex-1 min-w-0">
                                {note.isAutoGenerated && (
                                  <div className="flex items-center gap-1.5 mb-2">
                                    <Link2 className="w-3.5 h-3.5 text-indigo-500" />
                                    <span className="text-[10px] font-black text-indigo-500 uppercase tracking-widest bg-indigo-50 px-2 py-0.5 rounded border border-indigo-100">
                                      Wrike Import
                                    </span>
                                  </div>
                                )}
                                <p
                                  className="text-[14px] text-[#323b43] leading-relaxed break-all whitespace-pre-wrap markdown-content"
                                  dangerouslySetInnerHTML={{
                                    __html: parseFormatting(note.text),
                                  }}
                                />
                              </div>
                              <div className="flex flex-col gap-1.5 shrink-0 opacity-0 group-hover/note:opacity-100 transition-opacity bg-white p-1.5 rounded-xl border border-slate-100 shadow-sm">
                                <button
                                  onClick={() =>
                                    startEditing(activeCamp.id, note, note.text)
                                  }
                                  className="p-2 text-[#768994] hover:text-[#12a0e1] hover:bg-slate-50 rounded-lg transition-colors"
                                >
                                  <Edit2 className="w-4 h-4" />
                                </button>
                                <button
                                  onClick={() =>
                                    handleDeleteNote(activeCamp.id, note.id)
                                  }
                                  className="p-2 text-[#768994] hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-colors"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      ))}

                      {/* Inline Add Note Input */}
                      {addingNoteCampId === activeCamp.id && (
                        <div className="flex flex-col gap-3 bg-indigo-50/50 p-4 rounded-2xl border border-indigo-100 animate-in fade-in slide-in-from-top-2">
                          <div className="flex gap-1.5 border-b border-indigo-100 pb-2">
                            <button
                              onClick={() =>
                                handleFormat(
                                  "bold",
                                  newNoteText,
                                  setNewNoteText,
                                  "add-note-textarea"
                                )
                              }
                              className="p-1.5 hover:bg-indigo-100 rounded text-indigo-600 transition-colors"
                              title="Bold"
                            >
                              <Bold className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() =>
                                handleFormat(
                                  "italic",
                                  newNoteText,
                                  setNewNoteText,
                                  "add-note-textarea"
                                )
                              }
                              className="p-1.5 hover:bg-indigo-100 rounded text-indigo-600 transition-colors"
                              title="Italic"
                            >
                              <Italic className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() =>
                                handleFormat(
                                  "link",
                                  newNoteText,
                                  setNewNoteText,
                                  "add-note-textarea"
                                )
                              }
                              className="p-1.5 hover:bg-indigo-100 rounded text-indigo-600 transition-colors"
                              title="Add Link"
                            >
                              <Link2 className="w-4 h-4" />
                            </button>
                          </div>
                          <div className="flex gap-3 items-start">
                            <textarea
                              id="add-note-textarea"
                              autoFocus
                              placeholder="Type your new note here... Highlight text and click the buttons above to format."
                              value={newNoteText}
                              onChange={(e) => setNewNoteText(e.target.value)}
                              className="w-full text-sm text-[#122027] bg-transparent border-none resize-y min-h-[150px] outline-none focus:ring-0 p-0 placeholder:text-indigo-300 leading-relaxed custom-scrollbar"
                              rows="8"
                            />
                            <div className="flex flex-col gap-2 shrink-0">
                              <button
                                onClick={() => handleAddNote(activeCamp.id)}
                                className="p-2 bg-[#12a0e1] text-white hover:bg-[#0f88c0] rounded-xl transition-colors shadow-sm"
                              >
                                <Check className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => setAddingNoteCampId(null)}
                                className="p-2 bg-white text-[#768994] border border-slate-200 hover:bg-slate-50 rounded-xl transition-colors shadow-sm"
                              >
                                <X className="w-4 h-4" />
                              </button>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* RIGHT PANE: Folders (Pure CSS Flex-Basis Slide) */}
                  <div
                    className={`transition-all duration-500 ease-[cubic-bezier(0.4,0,0.2,1)] overflow-hidden flex flex-col ${
                      showFoldersPanel
                        ? "w-full lg:w-[420px] xl:w-[520px] max-h-[500px] lg:max-h-full opacity-100 mt-6 lg:mt-0 lg:ml-6"
                        : "w-full lg:w-0 max-h-0 lg:max-h-full opacity-0 mt-0 lg:ml-0"
                    }`}
                  >
                    {/* Inner rigid container prevents content squishing while the wrapper shrinks */}
                    <div className="w-full lg:w-[420px] xl:w-[520px] shrink-0 bg-slate-50 border border-[#dce4ec] rounded-2xl flex flex-col h-full shadow-inner min-h-[300px]">
                      <div className="p-4 border-b border-[#dce4ec] flex justify-between items-center bg-white shrink-0 rounded-t-2xl">
                        <div className="flex items-center gap-2.5">
                          <div className="p-1.5 bg-indigo-100 text-indigo-600 rounded-lg">
                            <Folder className="w-4 h-4" />
                          </div>
                          <h3 className="font-black text-[#122027]">
                            Links & Folders
                          </h3>
                        </div>
                        <button
                          onClick={() => setShowFoldersPanel(false)}
                          className="p-1.5 text-[#768994] hover:bg-slate-100 hover:text-rose-500 rounded-full transition-colors"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>

                      <div className="flex-1 overflow-y-auto p-4 custom-scrollbar space-y-3">
                        {(activeCamp.links || []).length === 0 ? (
                          <div className="flex flex-col items-center justify-center py-10 text-slate-400">
                            <Link2 className="w-8 h-8 mb-3 opacity-50" />
                            <p className="text-sm font-medium">
                              No links/folders added yet.
                            </p>
                          </div>
                        ) : (
                          (activeCamp.links || []).map((link) => (
                            <React.Fragment key={link.id}>
                              {editingLink.campId === activeCamp.id &&
                              editingLink.linkId === link.id ? (
                                <div className="group relative bg-white border border-indigo-300 rounded-xl p-3 flex flex-col gap-2 shadow-sm animate-in fade-in zoom-in-95 duration-200">
                                  <input
                                    type="text"
                                    value={editLinkTitle}
                                    onChange={(e) =>
                                      setEditLinkTitle(e.target.value)
                                    }
                                    className="w-full bg-slate-50 border border-[#dce4ec] rounded-lg px-2.5 py-1.5 text-xs font-bold text-[#122027] outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all"
                                    placeholder="Link Title"
                                  />
                                  <textarea
                                    value={editLinkUrl}
                                    onChange={(e) =>
                                      setEditLinkUrl(e.target.value)
                                    }
                                    className="w-full bg-slate-50 border border-[#dce4ec] rounded-lg px-2.5 py-1.5 text-[10px] font-mono text-[#768994] outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all resize-y min-h-[60px] custom-scrollbar"
                                    placeholder="URL / Path"
                                  />
                                  <div className="flex justify-end gap-2 mt-1">
                                    <button
                                      onClick={cancelEditingLink}
                                      className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                                      title="Cancel"
                                    >
                                      <X className="w-4 h-4" />
                                    </button>
                                    <button
                                      onClick={() =>
                                        handleSaveEditLink(
                                          activeCamp.id,
                                          link.id
                                        )
                                      }
                                      className="p-1.5 text-emerald-600 hover:text-white hover:bg-emerald-500 bg-emerald-50 rounded-lg transition-colors"
                                      title="Save Link"
                                    >
                                      <Check className="w-4 h-4" />
                                    </button>
                                  </div>
                                </div>
                              ) : (
                                <div className="group relative bg-white border border-slate-200 rounded-xl p-3 flex flex-col gap-3 hover:border-indigo-300 hover:shadow-sm transition-all">
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 mb-1.5">
                                      {link.isAutoGenerated && (
                                        <span className="text-[9px] font-black uppercase tracking-widest bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded border border-emerald-200">
                                          Auto
                                        </span>
                                      )}
                                      <h4 className="font-bold text-[#122027] break-words text-sm">
                                        {link.title}
                                      </h4>
                                    </div>
                                    <p className="text-[11px] text-[#768994] break-all whitespace-pre-wrap font-mono bg-slate-50 p-2.5 rounded-lg border border-slate-100 leading-relaxed">
                                      {link.url}
                                    </p>
                                  </div>

                                  <div className="flex items-center justify-end gap-2 shrink-0">
                                    <button
                                      onClick={() =>
                                        handleCopyLink(link.url, link.id)
                                      }
                                      className={`flex items-center justify-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex-1 ${
                                        copiedLinkId === link.id
                                          ? "bg-emerald-500 text-white shadow-sm shadow-emerald-500/20"
                                          : "bg-slate-100 text-[#323b43] hover:bg-indigo-50 hover:text-indigo-600"
                                      }`}
                                    >
                                      {copiedLinkId === link.id ? (
                                        <>
                                          <Check className="w-3.5 h-3.5" />{" "}
                                          Copied!
                                        </>
                                      ) : (
                                        <>
                                          <Copy className="w-3.5 h-3.5" /> Copy
                                          Link
                                        </>
                                      )}
                                    </button>

                                    {/* Edit Button */}
                                    <button
                                      onClick={() =>
                                        startEditingLink(activeCamp.id, link)
                                      }
                                      className="p-2 text-slate-400 hover:text-indigo-500 hover:bg-indigo-50 rounded-lg transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100"
                                      title="Edit Link"
                                    >
                                      <Edit2 className="w-4 h-4" />
                                    </button>

                                    <button
                                      onClick={() =>
                                        handleDeleteLink(activeCamp.id, link.id)
                                      }
                                      className="p-2 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100"
                                      title="Delete Link"
                                    >
                                      <Trash2 className="w-4 h-4" />
                                    </button>
                                  </div>
                                </div>
                              )}
                            </React.Fragment>
                          ))
                        )}
                      </div>

                      <div className="p-4 bg-white border-t border-[#dce4ec] shrink-0 rounded-b-2xl">
                        <div className="flex flex-col gap-2">
                          <input
                            type="text"
                            value={newLinkTitle}
                            onChange={(e) => setNewLinkTitle(e.target.value)}
                            placeholder="Link or folder title..."
                            className="w-full bg-slate-50 border border-[#dce4ec] rounded-xl px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all"
                          />
                          <div className="flex gap-2">
                            <input
                              type="text"
                              value={newLinkUrl}
                              onChange={(e) => setNewLinkUrl(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter")
                                  handleAddLink(activeCamp.id);
                              }}
                              placeholder="Paste URL..."
                              className="flex-1 min-w-0 bg-slate-50 border border-[#dce4ec] rounded-xl px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all font-mono"
                            />
                            <button
                              onClick={() => handleAddLink(activeCamp.id)}
                              disabled={
                                !newLinkTitle.trim() || !newLinkUrl.trim()
                              }
                              className="bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 text-white p-2 rounded-xl transition-colors shadow-sm shrink-0 flex items-center justify-center"
                            >
                              <Plus className="w-5 h-5" />
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Footer Actions */}
                <div className="p-6 bg-slate-50 border-t border-[#dce4ec] shrink-0 rounded-b-[2rem]">
                  <div className="flex gap-4">
                    <button
                      disabled={
                        !activeCamp.matrices || activeCamp.matrices.length === 0
                      }
                      onClick={() => setSelectedMatrix(activeCamp.matrices[0])}
                      className="flex-1 flex items-center justify-center gap-2 bg-[#12a0e1] hover:bg-[#0f88c0] text-white py-4 rounded-2xl text-sm font-black uppercase tracking-widest transition-all shadow-md active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed disabled:active:scale-100"
                    >
                      <FileText className="w-5 h-5" /> View Asset Matrix
                    </button>
                    <a
                      href={activeCamp.wrikeLink}
                      target="_blank"
                      rel="noreferrer"
                      className="flex-1 flex items-center justify-center gap-2 bg-[#122027] hover:bg-[#1a2d37] text-white py-4 rounded-2xl text-sm font-black uppercase tracking-widest transition-all shadow-md active:scale-95"
                    >
                      <ExternalLink className="w-5 h-5" /> Open in Wrike
                    </a>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Campaign Generation Creation Overlay Modal */}
        {isModalOpen && (
          <div className="fixed inset-0 bg-[#122027]/60 backdrop-blur-sm flex items-center justify-center z-[200] p-4">
            <div className="bg-white rounded-[24px] shadow-2xl w-full max-w-md overflow-hidden border border-[#dce4ec] animate-in zoom-in-95 duration-200">
              <div className="p-6 border-b border-[#dce4ec] flex justify-between items-center bg-slate-50/50">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 bg-[#12a0e1]/10 rounded-lg">
                    <Layout className="w-4 h-4 text-[#12a0e1]" />
                  </div>
                  <h3 className="text-lg font-black text-[#122027] tracking-tight">
                    Add New Item
                  </h3>
                </div>
                <button
                  onClick={handleCloseModal}
                  className="text-[#768994] hover:text-rose-500 hover:bg-rose-50 p-2 rounded-xl transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="p-6 space-y-5">
                <div>
                  <label className="block text-[10px] font-black text-[#768994] uppercase tracking-widest mb-2">
                    Campaign Title
                  </label>
                  <input
                    autoFocus
                    value={newCampaignTitle}
                    onChange={(e) => setNewCampaignTitle(e.target.value)}
                    className="w-full bg-slate-50 border border-[#dce4ec] rounded-xl px-4 py-3 text-sm font-medium text-[#122027] focus:outline-none focus:border-[#12a0e1] focus:ring-2 focus:ring-[#12a0e1]/20 transition-all placeholder:text-slate-400"
                    placeholder="e.g., Scary Movie 6..."
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-black text-[#768994] uppercase tracking-widest mb-2">
                    Matrix Link
                  </label>
                  <input
                    value={newCampaignLink}
                    onChange={(e) => setNewCampaignLink(e.target.value)}
                    className="w-full bg-slate-50 border border-[#dce4ec] rounded-xl px-4 py-3 text-sm font-medium text-[#122027] focus:outline-none focus:border-[#12a0e1] focus:ring-2 focus:ring-[#12a0e1]/20 transition-all placeholder:text-slate-400"
                    placeholder="Paste Wrike URL here..."
                  />
                </div>
              </div>
              <div className="p-5 bg-slate-50 border-t border-[#dce4ec] flex justify-end gap-3">
                <button
                  onClick={handleCloseModal}
                  className="px-5 py-2.5 text-xs font-black text-[#768994] hover:text-[#122027] hover:bg-slate-200/50 rounded-xl transition-colors uppercase tracking-widest"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveNewCampaign}
                  className="px-6 py-2.5 bg-[#12a0e1] hover:bg-[#0f88c0] text-white text-xs font-black uppercase tracking-widest rounded-xl shadow-md hover:shadow-[#12a0e1]/20 transition-all active:scale-95"
                >
                  Save Campaign
                </button>
              </div>
            </div>
          </div>
        )}

        {/* SPREADSHEET TABLE MODAL OVERLAY (z-[200]) */}
        {selectedMatrix && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-[#122027]/90 backdrop-blur-md animate-in fade-in duration-200">
            <div className="bg-white rounded-3xl w-full max-w-6xl h-[85vh] overflow-hidden shadow-2xl flex flex-col border border-white/20">
              <div className="p-6 border-b flex justify-between items-center bg-slate-50">
                <h2 className="text-xl font-black text-[#122027]">
                  {selectedMatrix.title}
                </h2>
                <button
                  onClick={() => setSelectedMatrix(null)}
                  className="p-2 hover:bg-slate-200 text-[#768994] hover:text-rose-600 rounded-full transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="p-6 overflow-auto bg-white flex-1 w-full max-w-full">
                <div
                  className="wrike-matrix-render overflow-x-auto min-w-full pb-4"
                  dangerouslySetInnerHTML={{ __html: selectedMatrix.tableHtml }}
                />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
