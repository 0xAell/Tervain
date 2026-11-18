// Runtime cue sheet for the original ford suite. tools/world-audio/render-ford.py reads these lengths.
export const FORD_AUDIO = {
  "music": {
    "ford_lanterns": {
      "kind": "piece",
      "mood": "vale",
      "origin": "composed",
      "title": "Lanterns at the Ford",
      "duration": 59.48,
      "file": "ford/lanterns",
      "channels": 2
    },
    "bough_watch": {
      "kind": "piece",
      "mood": "wild",
      "origin": "composed",
      "title": "The Bough Watch",
      "duration": 59.13,
      "file": "ford/bough-watch",
      "channels": 2
    },
    "spring_stones": {
      "kind": "piece",
      "mood": "sacred",
      "origin": "composed",
      "title": "Three Spring Stones",
      "duration": 36.92,
      "file": "ford/spring-stones",
      "channels": 2
    },
    "banked_embers": {
      "kind": "piece",
      "mood": "night",
      "origin": "composed",
      "title": "Banked Embers",
      "duration": 74.0,
      "file": "ford/banked-embers",
      "channels": 2
    }
  },
  "loops": {
    "riverbank": {
      "file": "ford/riverbank",
      "channels": 1,
      "duration": 19
    },
    "low_weir": {
      "file": "ford/low-weir",
      "channels": 1,
      "duration": 13
    }
  },
  "banks": {
    "timber": {
      "file": "ford/timber",
      "clips": {
        "step.plank": [
          [
            0.1,
            0.46
          ],
          [
            0.66,
            0.46
          ],
          [
            1.22,
            0.46
          ],
          [
            1.78,
            0.46
          ]
        ],
        "step.shallows": [
          [
            2.34,
            0.57
          ],
          [
            3.01,
            0.57
          ],
          [
            3.68,
            0.57
          ],
          [
            4.35,
            0.57
          ]
        ],
        "door.latch": [
          [
            5.02,
            0.32
          ],
          [
            5.44,
            0.32
          ],
          [
            5.86,
            0.32
          ],
          [
            6.28,
            0.32
          ]
        ]
      },
      "duration": 6.7
    }
  }
} as const;
