/** Palette data adapted from Flow-Tube/Flow, GPL-3.0. See THIRD_PARTY_NOTICES.md. */
export interface FlowPaletteSeed { primary: string; onPrimary: string; secondary: string; background: string; surface: string; onSurface: string; onSurfaceVariant: string; outline: string; error: string; }
export interface FlowPalette { id: `flow-${string}`; name: string; subtitle: string; light: FlowPaletteSeed; dark: FlowPaletteSeed; }
export const FLOW_PALETTES: FlowPalette[] = [
  {
    "id": "flow-default",
    "name": "Flow Default",
    "subtitle": "The original Flow palette with the YouTube red accent.",
    "light": {
      "primary": "#FF0000",
      "onPrimary": "#FFFFFF",
      "secondary": "#606060",
      "background": "#FFFFFF",
      "surface": "#F3F3F3",
      "onSurface": "#111111",
      "onSurfaceVariant": "#5F5F5F",
      "outline": "#D7D7D7",
      "error": "#D32F2F"
    },
    "dark": {
      "primary": "#FF0000",
      "onPrimary": "#FFFFFF",
      "secondary": "#AAAAAA",
      "background": "#0F0F0F",
      "surface": "#1D1D1D",
      "onSurface": "#F4F4F4",
      "onSurfaceVariant": "#B8B8B8",
      "outline": "#343434",
      "error": "#EF5350"
    }
  },
  {
    "id": "flow-monochrome",
    "name": "Monochrome",
    "subtitle": "A neutral, distraction-free palette with maximum clarity.",
    "light": {
      "primary": "#202020",
      "onPrimary": "#FFFFFF",
      "secondary": "#595959",
      "background": "#FFFFFF",
      "surface": "#F2F2F2",
      "onSurface": "#111111",
      "onSurfaceVariant": "#575757",
      "outline": "#D2D2D2",
      "error": "#A62B2B"
    },
    "dark": {
      "primary": "#EEEEEE",
      "onPrimary": "#111111",
      "secondary": "#BCBCBC",
      "background": "#111111",
      "surface": "#1D1D1D",
      "onSurface": "#F3F3F3",
      "onSurfaceVariant": "#BCBCBC",
      "outline": "#3A3A3A",
      "error": "#E06C6C"
    }
  },
  {
    "id": "flow-catppuccin",
    "name": "Catppuccin",
    "subtitle": "Soothing pastel Latte and Mocha-inspired colors.",
    "light": {
      "primary": "#8839EF",
      "onPrimary": "#FFFFFF",
      "secondary": "#7287FD",
      "background": "#EFF1F5",
      "surface": "#E6E9EF",
      "onSurface": "#4C4F69",
      "onSurfaceVariant": "#6C6F85",
      "outline": "#BCC0CC",
      "error": "#D20F39"
    },
    "dark": {
      "primary": "#CBA6F7",
      "onPrimary": "#1E1E2E",
      "secondary": "#89B4FA",
      "background": "#11111B",
      "surface": "#1E1E2E",
      "onSurface": "#CDD6F4",
      "onSurfaceVariant": "#A6ADC8",
      "outline": "#45475A",
      "error": "#F38BA8"
    }
  },
  {
    "id": "flow-green-apple",
    "name": "Green Apple",
    "subtitle": "Fresh green accents with soft organic surfaces.",
    "light": {
      "primary": "#3F7D20",
      "onPrimary": "#FFFFFF",
      "secondary": "#72A83B",
      "background": "#FBFFF7",
      "surface": "#EEF6E8",
      "onSurface": "#17210F",
      "onSurfaceVariant": "#53614A",
      "outline": "#C7D7BB",
      "error": "#BA1A1A"
    },
    "dark": {
      "primary": "#A5D66A",
      "onPrimary": "#1D3700",
      "secondary": "#89B75A",
      "background": "#10150C",
      "surface": "#1A2214",
      "onSurface": "#E7F0DF",
      "onSurfaceVariant": "#BDCBB3",
      "outline": "#3B4932",
      "error": "#FFB4AB"
    }
  },
  {
    "id": "flow-lavender",
    "name": "Lavender",
    "subtitle": "Calm violet tones with gentle contrast.",
    "light": {
      "primary": "#7357A4",
      "onPrimary": "#FFFFFF",
      "secondary": "#8D73B8",
      "background": "#FDF9FF",
      "surface": "#F3EDFA",
      "onSurface": "#211A29",
      "onSurfaceVariant": "#62586C",
      "outline": "#D0C4DB",
      "error": "#BA1A1A"
    },
    "dark": {
      "primary": "#D2B8FF",
      "onPrimary": "#3E246C",
      "secondary": "#BEA4E6",
      "background": "#151119",
      "surface": "#211A28",
      "onSurface": "#EEE6F2",
      "onSurfaceVariant": "#CABFD0",
      "outline": "#4A4053",
      "error": "#FFB4AB"
    }
  },
  {
    "id": "flow-nord",
    "name": "Nord",
    "subtitle": "An arctic, north-bluish palette.",
    "light": {
      "primary": "#5E81AC",
      "onPrimary": "#FFFFFF",
      "secondary": "#81A1C1",
      "background": "#ECEFF4",
      "surface": "#E5E9F0",
      "onSurface": "#2E3440",
      "onSurfaceVariant": "#4C566A",
      "outline": "#C3CAD5",
      "error": "#BF616A"
    },
    "dark": {
      "primary": "#88C0D0",
      "onPrimary": "#1F2933",
      "secondary": "#81A1C1",
      "background": "#242933",
      "surface": "#2E3440",
      "onSurface": "#ECEFF4",
      "onSurfaceVariant": "#D8DEE9",
      "outline": "#4C566A",
      "error": "#BF616A"
    }
  },
  {
    "id": "flow-tako",
    "name": "Tako",
    "subtitle": "Mihon-inspired purple with warm companion tones.",
    "light": {
      "primary": "#6650A4",
      "onPrimary": "#FFFFFF",
      "secondary": "#7D5260",
      "background": "#FFF7FF",
      "surface": "#F6EEF8",
      "onSurface": "#211F26",
      "onSurfaceVariant": "#625B67",
      "outline": "#CAC2CF",
      "error": "#BA1A1A"
    },
    "dark": {
      "primary": "#D0BCFF",
      "onPrimary": "#381E72",
      "secondary": "#E8B9C7",
      "background": "#17131C",
      "surface": "#221D29",
      "onSurface": "#E9E1EB",
      "onSurfaceVariant": "#CCC3D0",
      "outline": "#4B4450",
      "error": "#FFB4AB"
    }
  },
  {
    "id": "flow-yin-yang",
    "name": "Yin & Yang",
    "subtitle": "Balanced black and white in its purest form.",
    "light": {
      "primary": "#343434",
      "onPrimary": "#FFFFFF",
      "secondary": "#6E6E6E",
      "background": "#FAFAFA",
      "surface": "#EDEDED",
      "onSurface": "#151515",
      "onSurfaceVariant": "#5B5B5B",
      "outline": "#CCCCCC",
      "error": "#B3261E"
    },
    "dark": {
      "primary": "#FAFAFA",
      "onPrimary": "#171717",
      "secondary": "#C7C7C7",
      "background": "#0B0B0B",
      "surface": "#171717",
      "onSurface": "#F5F5F5",
      "onSurfaceVariant": "#BDBDBD",
      "outline": "#383838",
      "error": "#F2B8B5"
    }
  },
  {
    "id": "flow-strawberry-daiquiri",
    "name": "Strawberry Daiquiri",
    "subtitle": "A bright berry palette with soft cream surfaces.",
    "light": {
      "primary": "#B3264F",
      "onPrimary": "#FFFFFF",
      "secondary": "#9B405B",
      "background": "#FFF8F8",
      "surface": "#FCEBED",
      "onSurface": "#28171B",
      "onSurfaceVariant": "#6B555B",
      "outline": "#DBC0C7",
      "error": "#BA1A1A"
    },
    "dark": {
      "primary": "#FFB1C3",
      "onPrimary": "#67002B",
      "secondary": "#E8B8C4",
      "background": "#1C1013",
      "surface": "#291A1E",
      "onSurface": "#F4DFE4",
      "onSurfaceVariant": "#D6C0C6",
      "outline": "#523B41",
      "error": "#FFB4AB"
    }
  },
  {
    "id": "flow-kanagawa",
    "name": "Kanagawa",
    "subtitle": "Inky blues and warm lotus tones inspired by Hokusai.",
    "light": {
      "primary": "#6F5C2F",
      "onPrimary": "#FFFFFF",
      "secondary": "#597B75",
      "background": "#F2ECDC",
      "surface": "#E7DFCF",
      "onSurface": "#36322B",
      "onSurfaceVariant": "#6F685B",
      "outline": "#C5BAA5",
      "error": "#C34043"
    },
    "dark": {
      "primary": "#E6C384",
      "onPrimary": "#282727",
      "secondary": "#7E9CD8",
      "background": "#1F1F28",
      "surface": "#2A2A37",
      "onSurface": "#DCD7BA",
      "onSurfaceVariant": "#C8C093",
      "outline": "#54546D",
      "error": "#E46876"
    }
  },
  {
    "id": "flow-tokyo-night",
    "name": "Tokyo Night",
    "subtitle": "Calm blue-violet colors drawn from the night city.",
    "light": {
      "primary": "#34548A",
      "onPrimary": "#FFFFFF",
      "secondary": "#5A4A78",
      "background": "#D5D6DB",
      "surface": "#CBCCD1",
      "onSurface": "#343B58",
      "onSurfaceVariant": "#596172",
      "outline": "#A8ABB5",
      "error": "#8C4351"
    },
    "dark": {
      "primary": "#7AA2F7",
      "onPrimary": "#10121B",
      "secondary": "#BB9AF7",
      "background": "#16161E",
      "surface": "#1F2335",
      "onSurface": "#C0CAF5",
      "onSurfaceVariant": "#A9B1D6",
      "outline": "#3B4261",
      "error": "#F7768E"
    }
  },
  {
    "id": "flow-rose-pine",
    "name": "Rosé Pine",
    "subtitle": "Natural pine, rose, and gold-tinted neutrals.",
    "light": {
      "primary": "#907AA9",
      "onPrimary": "#FFFFFF",
      "secondary": "#D7827E",
      "background": "#FAF4ED",
      "surface": "#F2E9E1",
      "onSurface": "#575279",
      "onSurfaceVariant": "#797593",
      "outline": "#CECACD",
      "error": "#B4637A"
    },
    "dark": {
      "primary": "#C4A7E7",
      "onPrimary": "#191724",
      "secondary": "#EBBCBA",
      "background": "#191724",
      "surface": "#26233A",
      "onSurface": "#E0DEF4",
      "onSurfaceVariant": "#908CAA",
      "outline": "#403D52",
      "error": "#EB6F92"
    }
  },
  {
    "id": "flow-everforest",
    "name": "Everforest",
    "subtitle": "A soft, low-contrast forest palette.",
    "light": {
      "primary": "#8DA101",
      "onPrimary": "#FFFFFF",
      "secondary": "#35A77C",
      "background": "#FDF6E3",
      "surface": "#F4F0D9",
      "onSurface": "#5C6A72",
      "onSurfaceVariant": "#829181",
      "outline": "#D3CDB2",
      "error": "#F85552"
    },
    "dark": {
      "primary": "#A7C080",
      "onPrimary": "#1E2326",
      "secondary": "#83C092",
      "background": "#1E2326",
      "surface": "#272E33",
      "onSurface": "#D3C6AA",
      "onSurfaceVariant": "#9DA9A0",
      "outline": "#414B50",
      "error": "#E67E80"
    }
  },
  {
    "id": "flow-gruvbox",
    "name": "Gruvbox",
    "subtitle": "Warm, earthy retro colors.",
    "light": {
      "primary": "#B57614",
      "onPrimary": "#FFFFFF",
      "secondary": "#79740E",
      "background": "#FBF1C7",
      "surface": "#EBDBB2",
      "onSurface": "#3C3836",
      "onSurfaceVariant": "#665C54",
      "outline": "#D5C4A1",
      "error": "#CC241D"
    },
    "dark": {
      "primary": "#FABD2F",
      "onPrimary": "#282828",
      "secondary": "#B8BB26",
      "background": "#1D2021",
      "surface": "#282828",
      "onSurface": "#EBDBB2",
      "onSurfaceVariant": "#BDAE93",
      "outline": "#504945",
      "error": "#FB4934"
    }
  },
  {
    "id": "flow-dracula",
    "name": "Dracula",
    "subtitle": "The classic high-contrast purple palette.",
    "light": {
      "primary": "#6D4AA2",
      "onPrimary": "#FFFFFF",
      "secondary": "#A33C83",
      "background": "#F8F7FB",
      "surface": "#ECEAF2",
      "onSurface": "#282A36",
      "onSurfaceVariant": "#626473",
      "outline": "#CFCCD8",
      "error": "#C93654"
    },
    "dark": {
      "primary": "#BD93F9",
      "onPrimary": "#282A36",
      "secondary": "#FF79C6",
      "background": "#21222C",
      "surface": "#282A36",
      "onSurface": "#F8F8F2",
      "onSurfaceVariant": "#C5C8D4",
      "outline": "#44475A",
      "error": "#FF5555"
    }
  },
  {
    "id": "flow-solarized",
    "name": "Solarized",
    "subtitle": "A precision low-glare blue and cyan palette.",
    "light": {
      "primary": "#268BD2",
      "onPrimary": "#FFFFFF",
      "secondary": "#2AA198",
      "background": "#FDF6E3",
      "surface": "#EEE8D5",
      "onSurface": "#586E75",
      "onSurfaceVariant": "#657B83",
      "outline": "#D6CFB8",
      "error": "#DC322F"
    },
    "dark": {
      "primary": "#2AA198",
      "onPrimary": "#002B36",
      "secondary": "#268BD2",
      "background": "#002B36",
      "surface": "#073642",
      "onSurface": "#EEE8D5",
      "onSurfaceVariant": "#93A1A1",
      "outline": "#335963",
      "error": "#DC322F"
    }
  },
  {
    "id": "flow-tide",
    "name": "Tide",
    "subtitle": "Deep slate surfaces with muted teal.",
    "light": {
      "primary": "#247F83",
      "onPrimary": "#FFFFFF",
      "secondary": "#5C8F91",
      "background": "#F4FBFB",
      "surface": "#E5F1F1",
      "onSurface": "#183638",
      "onSurfaceVariant": "#587173",
      "outline": "#BFD1D1",
      "error": "#BA1A1A"
    },
    "dark": {
      "primary": "#78C6C5",
      "onPrimary": "#093737",
      "secondary": "#97B8B8",
      "background": "#101A1C",
      "surface": "#182529",
      "onSurface": "#DCE8E8",
      "onSurfaceVariant": "#AABBBB",
      "outline": "#34474B",
      "error": "#FFB4AB"
    }
  },
  {
    "id": "flow-sage",
    "name": "Sage",
    "subtitle": "Muted forest green that stays calm and soft.",
    "light": {
      "primary": "#5D7456",
      "onPrimary": "#FFFFFF",
      "secondary": "#778870",
      "background": "#F7FAF4",
      "surface": "#EBF0E7",
      "onSurface": "#20281D",
      "onSurfaceVariant": "#5D6858",
      "outline": "#C5CEC0",
      "error": "#BA1A1A"
    },
    "dark": {
      "primary": "#B4CDA9",
      "onPrimary": "#21351D",
      "secondary": "#AEBFA7",
      "background": "#121812",
      "surface": "#1C251D",
      "onSurface": "#E2E9DF",
      "onSurfaceVariant": "#BEC8BA",
      "outline": "#3B493A",
      "error": "#FFB4AB"
    }
  },
  {
    "id": "flow-caffeine",
    "name": "Caffeine",
    "subtitle": "Coffee tones balanced with cream and espresso.",
    "light": {
      "primary": "#795548",
      "onPrimary": "#FFFFFF",
      "secondary": "#9A6F5D",
      "background": "#FFFAF6",
      "surface": "#F3E9E1",
      "onSurface": "#30231E",
      "onSurfaceVariant": "#6D5A51",
      "outline": "#D7C4B9",
      "error": "#BA1A1A"
    },
    "dark": {
      "primary": "#E6C2AA",
      "onPrimary": "#442A1E",
      "secondary": "#C7A797",
      "background": "#15110F",
      "surface": "#221A17",
      "onSurface": "#EEE4DF",
      "onSurfaceVariant": "#CDBDB5",
      "outline": "#493A34",
      "error": "#FFB4AB"
    }
  },
  {
    "id": "flow-claude",
    "name": "Claude",
    "subtitle": "Warm clay accents on paper-like surfaces.",
    "light": {
      "primary": "#C15F3C",
      "onPrimary": "#FFFFFF",
      "secondary": "#7D685F",
      "background": "#F7F4EF",
      "surface": "#ECE7DF",
      "onSurface": "#2F2926",
      "onSurfaceVariant": "#6B605B",
      "outline": "#D2C9C0",
      "error": "#B3261E"
    },
    "dark": {
      "primary": "#E07A58",
      "onPrimary": "#2B1510",
      "secondary": "#B9A49B",
      "background": "#1D1B19",
      "surface": "#282522",
      "onSurface": "#EEE9E5",
      "onSurfaceVariant": "#C8BEB8",
      "outline": "#4B4541",
      "error": "#FFB4AB"
    }
  },
  {
    "id": "flow-deep-ocean",
    "name": "Deep Ocean",
    "subtitle": "Calm blues drawn from deep water.",
    "light": {
      "primary": "#00629B",
      "onPrimary": "#FFFFFF",
      "secondary": "#2E7FA6",
      "background": "#F5FAFF",
      "surface": "#E6F0F9",
      "onSurface": "#0B2135",
      "onSurfaceVariant": "#4A6072",
      "outline": "#BFD0DF",
      "error": "#BA1A1A"
    },
    "dark": {
      "primary": "#4FB3E8",
      "onPrimary": "#00253A",
      "secondary": "#7FD1E0",
      "background": "#0A1929",
      "surface": "#132438",
      "onSurface": "#E3F2FD",
      "onSurfaceVariant": "#A9C1D6",
      "outline": "#2A4058",
      "error": "#FFB4AB"
    }
  },
  {
    "id": "flow-gunmetal",
    "name": "Gunmetal",
    "subtitle": "Industrial greys with a cool metal edge.",
    "light": {
      "primary": "#455A64",
      "onPrimary": "#FFFFFF",
      "secondary": "#607D8B",
      "background": "#F7F9FA",
      "surface": "#ECEFF1",
      "onSurface": "#1C2429",
      "onSurfaceVariant": "#546E7A",
      "outline": "#CFD8DC",
      "error": "#B3261E"
    },
    "dark": {
      "primary": "#90A4AE",
      "onPrimary": "#11181D",
      "secondary": "#78909C",
      "background": "#0F1216",
      "surface": "#1A1F26",
      "onSurface": "#ECEFF1",
      "onSurfaceVariant": "#B0BEC5",
      "outline": "#37424C",
      "error": "#EF9A9A"
    }
  },
  {
    "id": "flow-cosmic-void",
    "name": "Cosmic Void",
    "subtitle": "Near-black depths with electric violet.",
    "light": {
      "primary": "#5B2DE0",
      "onPrimary": "#FFFFFF",
      "secondary": "#7C4DFF",
      "background": "#FBF9FF",
      "surface": "#F0ECFB",
      "onSurface": "#1B1726",
      "onSurfaceVariant": "#5B5470",
      "outline": "#D6CFE6",
      "error": "#B3261E"
    },
    "dark": {
      "primary": "#A384FF",
      "onPrimary": "#1A0059",
      "secondary": "#8C63FF",
      "background": "#050505",
      "surface": "#121212",
      "onSurface": "#E8E3F5",
      "onSurfaceVariant": "#B9B0CC",
      "outline": "#2E2A38",
      "error": "#FF8A80"
    }
  },
  {
    "id": "flow-cyberpunk",
    "name": "Cyberpunk",
    "subtitle": "Neon magenta and cyan for a future city.",
    "light": {
      "primary": "#A3008F",
      "onPrimary": "#FFFFFF",
      "secondary": "#00838F",
      "background": "#FFF7FE",
      "surface": "#F6E9F7",
      "onSurface": "#24102A",
      "onSurfaceVariant": "#66506B",
      "outline": "#DCC5DF",
      "error": "#BA1A1A"
    },
    "dark": {
      "primary": "#FF4DF0",
      "onPrimary": "#2B0029",
      "secondary": "#00E5FF",
      "background": "#0D001A",
      "surface": "#1A0A2E",
      "onSurface": "#F2E6FF",
      "onSurfaceVariant": "#C4B0DD",
      "outline": "#3D2A5A",
      "error": "#FF5C8A"
    }
  },
  {
    "id": "flow-royal-gold",
    "name": "Royal Gold",
    "subtitle": "Rich, prestigious golds on deep darks.",
    "light": {
      "primary": "#7D6300",
      "onPrimary": "#FFFFFF",
      "secondary": "#9A7D12",
      "background": "#FFFDF5",
      "surface": "#F7F0DC",
      "onSurface": "#221C08",
      "onSurfaceVariant": "#665C3D",
      "outline": "#DDD2B0",
      "error": "#BA1A1A"
    },
    "dark": {
      "primary": "#FFD700",
      "onPrimary": "#2A2100",
      "secondary": "#C5A000",
      "background": "#050505",
      "surface": "#141210",
      "onSurface": "#FFF8E1",
      "onSurfaceVariant": "#D6C9A3",
      "outline": "#3A3423",
      "error": "#FFB4AB"
    }
  },
  {
    "id": "flow-cream-paper",
    "name": "Cream Paper",
    "subtitle": "Warm paper tones for cosy daytime reading.",
    "light": {
      "primary": "#7F6157",
      "onPrimary": "#FFFFFF",
      "secondary": "#A1887F",
      "background": "#FFFBF0",
      "surface": "#F5F5DC",
      "onSurface": "#3E2723",
      "onSurfaceVariant": "#6D5C52",
      "outline": "#DCD3BD",
      "error": "#B3261E"
    },
    "dark": {
      "primary": "#D7B7A8",
      "onPrimary": "#3B2620",
      "secondary": "#BCAAA4",
      "background": "#1A1712",
      "surface": "#25211A",
      "onSurface": "#F1EBDF",
      "onSurfaceVariant": "#CFC4B3",
      "outline": "#4A4336",
      "error": "#FFB4AB"
    }
  }
];
