/* -----------------------------------------------------------
   AUTO-GENERATED — do not hand-edit.
   Source of truth: assets/diwali_days.json
   Regenerate with: python tools/sync_diwali_days_js.py

   Embeds the calendar config as a JS global instead of a .json file that
   has to be fetch()'d, so the page keeps working when opened directly via
   the file:// protocol (see tools/sync_diwali_days_js.py docstring).
----------------------------------------------------------- */
window.DIWALI_DAYS_DATA = {
  "_meta": {
    "note": "Sequential unlock: diyas open in day order (1→15) via currentUnlockedDay in sketch.js. Layout rings are independent of unlock order: outer=1–10, middle=11/12/14/15, center=13 (main Diwali). Mandala rings bloom as each ring's diyas are lit. IDs 11-15 are the 5 official Diwali days — marked special:true with jewel-tone tint.",
    "payloadTypes": "text | assets/image.png | mp4:assets/video.mp4",
    "background": "images/diwali-background.png (664x997)"
  },
  "mandala": {
    "cx": 0.5,
    "cy": 0.7,
    "radii": {
      "1": 0.4669,
      "2": 0.1958,
      "3": 0.0828
    },
    "ringExtraOffsetX": {
      "1": 0,
      "2": 0,
      "3": 0
    },
    "ringExtraOffsetY": {
      "1": -0.0791,
      "2": -0.0791,
      "3": -0.0791
    }
  },
  "radialLayout": {
    "_note": "Controls the Radial/Petal lamp placement. cx/cy = mandala visual centre as fractions of canvas width & height (cy = mandala.cy + ringExtraOffsetY). Radii are fractions of canvas WIDTH — e.g. 0.32 ≈ 212 px on a 664 px wide canvas. angleOffsetDeg: 0 = 3 o'clock, -90 = 12 o'clock (top). middleAngleOffsetDeg: rotate the 4-lamp square so petals align; set 45 for diagonal petals. jitterPx: max random nudge in pixels per axis (applied after the perfect polar position).",
    "cx": 0.5,
    "cy": 0.6209,
    "outer": {
      "count": 10,
      "radius": 0.32,
      "angleOffsetDeg": -90
    },
    "middle": {
      "count": 4,
      "radius": 0.13,
      "angleOffsetDeg": 45
    },
    "jitterPx": 20
  },
  "banner": {
    "x": 0.5,
    "y": 0.135,
    "w": 0.84,
    "fontSize": 74,
    "minFontSize": 16,
    "lineHeight": 1.08,
    "maxLines": 2,
    "safeArea": {
      "x0": 0.15,
      "x1": 0.85,
      "y0": 0.28,
      "y1": 0.72
    }
  },
  "credits": {
    "enabled": true,
    "text": "",
    "color": "#FFD700",
    "x": 0.1,
    "y": 0.985,
    "fontSize": 20
  },
  "scrollBanner": {
    "_note": "The 'Countdown to Diwali' title banner. Edit 'text' to change what it says, or call scrollBanner.setText('...') from the browser console.",
    "enabled": true,
    "text": "Countdown to Diwali",
    "textColor": "#7a1204",
    "textShadow": "#ffe6b8"
  },
  "diyas": [
    {
      "id": 1,
      "ring": 1,
      "theme": "Rangoli",
      "emoji": "🎨",
      "description": "Rangoli are beautiful geometric patterns drawn at home entrances using coloured powders, flower petals, and rice. They welcome Lakshmi, the goddess of prosperity, into the home.",
      "payload": "text",
      "cardImage": "images/rangoli-doorstep.png",
      "pos": {
        "x": 0.2097,
        "y": 0.1538,
        "w": 0.078,
        "h": 0.12
      }
    },
    {
      "id": 2,
      "ring": 1,
      "theme": "Cleaning the Home",
      "emoji": "🏠",
      "description": "Two weeks before Diwali, families deep-clean every corner of the home. A spotless house invites Goddess Lakshmi — she is said to visit only homes that are pure and welcoming.",
      "payload": "text",
      "cardImage": "images/cleaning-home-diwali.png",
      "pos": {
        "x": 0.4363,
        "y": 0.1597,
        "w": 0.078,
        "h": 0.12
      }
    },
    {
      "id": 3,
      "ring": 1,
      "theme": "Gold & Silver",
      "emoji": "✨",
      "description": "On Dhanteras, people purchase gold, silver, or new utensils as a symbol of prosperity. Buying metal on this day is believed to bring Lakshmi's blessings for the year ahead.",
      "payload": "mp4:assets/videos/day3.mp4",
      "pos": {
        "x": 0.7537,
        "y": 0.1733,
        "w": 0.078,
        "h": 0.12
      }
    },
    {
      "id": 4,
      "ring": 1,
      "theme": "Festival Sweets",
      "emoji": "🍬",
      "description": "Mithai — traditional Indian sweets — are central to Diwali. Kaju Katli (cashew fudge), Gulab Jamun, Ladoo, and Barfi are gifted between families to share in the joy of the festival.",
      "payload": "text",
      "cardImage": "images/festival-sweets-mithai.png",
      "pos": {
        "x": 0.7708,
        "y": 0.3116,
        "w": 0.078,
        "h": 0.12
      }
    },
    {
      "id": 5,
      "ring": 1,
      "theme": "Traditional Dress",
      "emoji": "👗",
      "description": "Diwali is a time to wear new clothes. Women wear vibrant sarees and lehengas in jewel tones — deep reds, royal blues, and golds — while men don kurta-pajamas or sherwanis.",
      "payload": "text",
      "cardImage": "images/traditional-dress-diwali.png",
      "pos": {
        "x": 0.4524,
        "y": 0.3099,
        "w": 0.078,
        "h": 0.12
      }
    },
    {
      "id": 6,
      "ring": 1,
      "theme": "The Diya",
      "emoji": "🪔",
      "description": "A diya is a small clay oil lamp. Ghee or sesame oil fuels the cotton wick. Rows of diyas on windowsills and doorsteps symbolise the victory of light over darkness, and knowledge over ignorance.",
      "payload": "mp4:assets/videos/day6.mp4",
      "pos": {
        "x": 0.1634,
        "y": 0.3242,
        "w": 0.078,
        "h": 0.12
      }
    },
    {
      "id": 7,
      "ring": 1,
      "theme": "Fireworks",
      "emoji": "🎆",
      "description": "Firecrackers have been part of Diwali for centuries — their lights and sounds are believed to ward off evil spirits. Today, many celebrate with sparklers and low-smoke alternatives.",
      "payload": "text",
      "cardImage": "images/diwali-fireworks-sky.png",
      "pos": {
        "x": 0.1423,
        "y": 0.471,
        "w": 0.078,
        "h": 0.12
      }
    },
    {
      "id": 8,
      "ring": 1,
      "theme": "Marigold Garlands",
      "emoji": "🌼",
      "description": "Marigolds — called Genda Phool — are the flower of Diwali. Their vibrant orange and yellow hues symbolise auspiciousness and the sun. Garlands adorn doorways, idols, and offering plates.",
      "payload": "text",
      "cardImage": "images/marigold-garland-doorway.png",
      "pos": {
        "x": 0.4775,
        "y": 0.4813,
        "w": 0.078,
        "h": 0.12
      }
    },
    {
      "id": 9,
      "ring": 1,
      "theme": "Music & Dance",
      "emoji": "🥁",
      "description": "The dhol drum and tabla drive the rhythms of Diwali celebrations. Classical Bharatanatyam and folk Garba and Dandiya dances fill community gatherings with energy and colour.",
      "payload": "text",
      "cardImage": "images/music-and-dance.png",
      "pos": {
        "x": 0.6969,
        "y": 0.4827,
        "w": 0.078,
        "h": 0.12
      }
    },
    {
      "id": 10,
      "ring": 1,
      "theme": "Diwali Around the World",
      "emoji": "🌍",
      "description": "Diwali is celebrated by over a billion people globally — in India, UK, USA, Canada, Singapore, Fiji, South Africa, and beyond. It is a public holiday in over a dozen countries.",
      "payload": "text",
      "cardImage": "images/diwali-around-the-world.png",
      "pos": {
        "x": 0.7617,
        "y": 0.6212,
        "w": 0.078,
        "h": 0.12
      }
    },
    {
      "id": 11,
      "ring": 2,
      "special": true,
      "tint": [
        95,
        45,
        155
      ],
      "theme": "Dhanteras",
      "emoji": "💛",
      "description": "Day 1 of Diwali. Dhan means 'wealth'. Lakshmi and Kubera, god of wealth, are worshipped. Homes are lit with diyas at dusk, and new possessions are blessed for the year ahead.",
      "payload": "mp4:assets/videos/day11.mp4",
      "pos": {
        "x": 0.4986,
        "y": 0.6479,
        "w": 0.07,
        "h": 0.108
      }
    },
    {
      "id": 12,
      "ring": 2,
      "special": true,
      "tint": [
        155,
        30,
        45
      ],
      "theme": "Choti Diwali",
      "emoji": "🌙",
      "description": "Day 2 — 'Small Diwali'. Celebrates Lord Krishna's victory over the demon Narakasura. Families bathe before sunrise with scented oils, light extra diyas, and burst firecrackers.",
      "payload": "text",
      "cardImage": "images/choti-diwali-day2.png",
      "pos": {
        "x": 0.1808,
        "y": 0.6317,
        "w": 0.07,
        "h": 0.108
      }
    },
    {
      "id": 13,
      "ring": 3,
      "special": true,
      "tint": [
        170,
        120,
        10
      ],
      "theme": "Diwali — Main Day!",
      "emoji": "🎇",
      "description": "Day 3 — the heart of the festival! Lakshmi Puja is performed at night. Every home blazes with diyas and fairy lights. Fireworks light the sky. Families gather to pray, feast, and celebrate.",
      "payload": "mp4:assets/videos/day13.mp4",
      "pos": {
        "x": 0.2486,
        "y": 0.7931,
        "w": 0.07,
        "h": 0.108
      }
    },
    {
      "id": 14,
      "ring": 2,
      "special": true,
      "tint": [
        30,
        95,
        55
      ],
      "theme": "Govardhan Puja",
      "emoji": "🙏",
      "description": "Day 4 — Lord Krishna lifted Govardhan hill to shelter villagers from Indra's storms. Annakut — a mountain of food — is offered to deities as gratitude for nature's abundance.",
      "payload": "text",
      "cardImage": "images/govardhan-puja-day4.png",
      "pos": {
        "x": 0.4202,
        "y": 0.7859,
        "w": 0.07,
        "h": 0.108
      }
    },
    {
      "id": 15,
      "ring": 2,
      "special": true,
      "tint": [
        20,
        60,
        148
      ],
      "theme": "Bhai Dooj",
      "emoji": "💫",
      "description": "Day 5 — the final day. Sisters pray for their brothers' long life, and brothers give gifts in return. It celebrates the eternal bond between siblings, mirroring the love of Yama and Yamuna.",
      "payload": "mp4:assets/videos/day15.mp4",
      "pos": {
        "x": 0.7699,
        "y": 0.8011,
        "w": 0.07,
        "h": 0.108
      }
    }
  ]
};
