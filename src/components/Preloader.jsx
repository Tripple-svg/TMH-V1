import React, { useEffect } from 'react';
import { motion } from 'framer-motion';

export default function Preloader({ onComplete }) {
  useEffect(() => {
    const timer = setTimeout(() => {
      if (onComplete) onComplete();
    }, 4100);

    return () => clearTimeout(timer);
  }, [onComplete]);

  return (
    <motion.div
      initial={{ opacity: 1 }}
      exit={{ opacity: 0, scale: 1.03 }}
      transition={{ duration: 0.8, ease: [0.76, 0, 0.24, 1] }}
      className="preloader-container"
    >
      <style>{`
        .preloader-container {
          position: fixed;
          inset: 0;
          z-index: 9999;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          background-color: #000000;
          color: #ffffff;
          overflow: hidden;
        }

        .preloader-content {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          width: 100%;
          max-width: 400px;
          padding: 0 1.5rem;
        }

        .logo-wrapper {
          position: relative;
          width: 180px;
          height: 180px;
          display: flex;
          align-items: center;
          justify-content: center;
          filter: drop-shadow(0 0 25px rgba(255, 255, 255, 0.2));
        }

        .exact-svg-container {
          width: 100%;
          height: 100%;
          display: block;
          overflow: visible;
        }

        .starting-dot {
          position: absolute;
          width: 8px;
          height: 8px;
          background-color: #ffffff;
          border-radius: 50%;
          z-index: 10;
          box-shadow: 0 0 16px rgba(255, 255, 255, 0.9);
        }

        .text-group {
          display: flex;
          flex-direction: column;
          align-items: center;
          margin-top: 2.25rem; /* Spacious gap between shield and title */
          text-align: center;
        }

        .progress-bar-bg {
          margin-top: 3.5rem; /* Generous breathing room above progress bar */
          width: 10rem;
          height: 2px;
          background-color: rgba(255, 255, 255, 0.12);
          border-radius: 9999px;
          overflow: hidden;
        }

        .progress-bar-fill {
          height: 100%;
          background-color: #ffffff;
          border-radius: 9999px;
        }
      `}</style>

      <div className="preloader-content">
        {/* Shield Logo Wrapper */}
        <div className="logo-wrapper">
          {/* Pulse Dot */}
          <motion.div
            className="starting-dot"
            initial={{ scale: 1, opacity: 1 }}
            animate={{ scale: [1, 1.6, 0], opacity: [1, 1, 0] }}
            transition={{ duration: 0.5, ease: 'easeInOut' }}
          />

          {/* SVG Vector with Centered Coordinate Mapping */}
          <motion.svg
            viewBox="1000 700 3500 3500"
            className="exact-svg-container"
            initial={{ scale: 0.88, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1], delay: 0.1 }}
          >
            <g
              transform="scale(1,-1) translate(0,-5080)"
              fill="none"
              stroke="#ffffff"
              strokeWidth="70"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              {/* Outer Shield Path */}
              <motion.path
                d="M1412 2993 c3 -1064 3 -1068 25 -1145 64 -227 162 -394 328 -560 109 -110 131 -124 725 -453 102 -56 274 -152 383 -213 l198 -110 112 60 c62 33 137 75 167 93 30 18 123 70 205 115 731 404 703 387 831 514 138 139 224 272 285 437 65 178 62 121 66 1277 l4 1052 -1666 0 -1666 0 3 -1067z"
                initial={{ pathLength: 0, opacity: 0 }}
                animate={{ pathLength: 1, opacity: 1 }}
                transition={{ duration: 1.2, ease: 'easeInOut', delay: 0.2 }}
              />

              {/* M + V Shape */}
              <motion.path
                d="M4073 3806 c-17 -14 -34 -22 -38 -18 -5 4 -5 2 -2 -5 4 -6 -10 -28 -31 -50 -22 -21 -43 -45 -48 -54 -7 -13 -88 -106 -164 -188 -8 -9 -30 -34 -47 -54 -18 -21 -33 -34 -33 -30 0 4 -12 -10 -28 -32 -15 -23 -49 -62 -75 -87 -30 -29 -46 -52 -41 -59 4 -7 3 -9 -3 -6 -10 6 -73 -54 -73 -70 0 -5 -22 -33 -50 -63 -27 -30 -50 -59 -50 -63 0 -5 -5 -5 -12 -1 -6 4 -8 3 -5 -3 3 -5 -2 -16 -11 -24 -9 -9 -39 -42 -67 -75 -27 -32 -68 -79 -91 -104 -22 -25 -46 -52 -52 -60 -43 -55 -72 -79 -85 -74 -9 3 -27 23 -42 45 -15 23 -30 37 -37 33 -6 -4 -8 -3 -4 4 3 6 -6 20 -20 31 -15 12 -23 21 -18 21 4 0 -7 15 -25 33 -19 17 -40 42 -48 54 -9 13 -19 20 -24 17 -5 -3 -9 -1 -9 3 0 5 -12 24 -27 43 -158 191 -177 212 -187 203 -3 -4 -6 0 -6 8 0 9 -13 28 -30 44 -16 15 -27 33 -23 38 3 6 1 7 -5 3 -7 -4 -12 -3 -12 1 0 5 -20 31 -45 58 -25 28 -45 54 -45 58 0 5 -4 5 -10 2 -5 -3 -10 1 -10 10 0 9 -4 13 -10 10 -5 -3 -10 -2 -10 4 0 6 -19 29 -42 53 -24 23 -36 38 -28 34 8 -5 -1 7 -20 27 -19 19 -57 61 -85 93 -27 33 -82 92 -122 132 l-72 72 -183 0 c-164 -1 -185 -3 -205 -19 l-23 -19 1 -899 c0 -500 5 -930 10 -971 5 -40 19 -101 31 -135 22 -65 80 -181 104 -208 8 -8 14 -20 14 -25 0 -13 92 -100 103 -96 4 1 6 -2 2 -8 -3 -5 5 -15 20 -22 22 -10 28 -8 45 10 12 12 16 23 10 27 -6 4 -7 11 -4 17 4 6 7 438 7 960 0 521 3 948 6 948 3 -1 24 -17 46 -37 22 -20 33 -32 25 -28 -8 4 -1 -6 15 -22 17 -16 48 -50 70 -75 22 -25 67 -76 100 -114 33 -37 81 -90 108 -118 26 -27 47 -53 47 -58 0 -5 4 -6 10 -3 6 3 7 -1 4 -9 -3 -9 -1 -16 6 -16 6 0 18 -7 26 -15 9 -8 13 -15 10 -15 -3 0 11 -17 32 -38 20 -21 60 -65 87 -97 28 -32 60 -68 72 -78 12 -11 20 -24 17 -29 -3 -4 1 -8 9 -8 8 0 21 -8 28 -17 13 -17 12 -17 -6 -4 -11 8 -4 -1 15 -20 53 -52 79 -87 72 -94 -4 -4 -2 -5 4 -3 5 1 26 -15 45 -37 18 -22 51 -57 71 -77 20 -21 34 -38 31 -38 -2 0 26 -31 62 -68 37 -38 73 -69 81 -69 7 0 11 4 8 9 -3 4 0 8 6 8 6 0 25 14 42 30 17 17 35 27 41 23 7 -4 6 1 -2 11 -12 15 -12 17 0 14 8 -2 13 2 12 8 -1 5 14 19 33 29 25 13 34 24 31 37 -3 11 0 18 9 18 8 0 14 4 14 9 0 5 24 34 54 65 30 30 52 57 48 60 -3 3 0 6 7 6 7 0 10 4 7 8 -3 5 5 15 17 21 12 7 36 30 52 51 17 21 34 35 39 32 5 -3 6 0 2 6 -3 6 2 15 11 21 10 6 14 11 8 11 -5 0 11 18 35 40 24 22 41 40 36 40 -10 0 13 21 47 43 15 10 32 28 36 40 5 13 16 29 25 36 9 7 13 17 10 22 -3 5 -2 8 3 7 4 -2 9 1 10 6 1 5 6 12 12 15 6 4 22 22 36 41 14 19 25 28 25 21 0 -7 5 -9 11 -6 6 4 8 10 4 13 -3 3 16 27 42 54 26 26 44 48 41 48 -4 0 9 16 29 35 20 19 33 35 30 35 -3 0 22 28 56 63 97 98 136 144 130 151 -4 3 1 6 10 6 10 0 17 -6 17 -12 0 -7 0 -445 1 -973 0 -864 2 -961 16 -977 9 -10 19 -18 23 -18 8 0 77 67 109 106 13 16 33 40 45 53 12 14 15 21 6 17 -8 -4 -3 3 13 16 15 13 27 29 27 35 0 5 9 22 21 37 11 14 18 30 15 35 -4 5 0 15 7 23 12 12 20 34 31 88 2 8 6 22 9 30 24 69 27 199 27 1043 l-1 894 -22 21 c-20 19 -35 20 -180 22 -87 0 -165 4 -174 7 -12 5 -14 3 -8 -8 7 -12 6 -12 -7 -1 -13 11 -21 9 -45 -12z"
                initial={{ pathLength: 0, opacity: 0 }}
                animate={{ pathLength: 1, opacity: 1 }}
                transition={{ duration: 1.2, ease: 'easeInOut', delay: 0.4 }}
              />

              {/* Bottom H Shape */}
              <motion.path
                d="M2194 2839 c-18 -20 -19 -49 -20 -813 -1 -474 2 -798 7 -808 5 -10 14 -18 20 -18 5 0 22 -11 37 -25 15 -14 34 -25 44 -25 9 0 30 -11 46 -25 17 -14 34 -25 39 -25 4 0 35 -18 68 -40 68 -45 85 -48 102 -21 11 18 13 79 18 666 l0 60 514 -2 c282 -1 515 -4 518 -6 2 -3 5 -163 6 -355 3 -441 -8 -419 152 -318 39 24 74 41 79 38 5 -3 6 0 2 6 -7 11 7 16 41 15 7 -1 10 4 6 10 -4 6 0 8 10 4 11 -4 14 -2 11 7 -3 8 7 19 25 27 16 7 27 17 25 21 -3 4 0 8 6 8 6 0 8 5 5 10 -3 6 -2 10 4 10 7 0 9 263 8 791 -2 737 -3 791 -19 803 -10 7 -15 16 -11 20 4 4 -1 4 -12 0 -11 -5 -25 -13 -31 -18 -6 -6 -22 -20 -37 -30 -14 -11 -23 -24 -20 -29 3 -5 -5 -4 -17 3 -14 8 -20 8 -16 1 4 -6 -39 -56 -97 -114 l-105 -104 -7 -194 c-4 -107 -5 -211 -2 -231 l4 -37 -516 -3 c-336 -2 -519 0 -523 7 -4 6 -8 109 -8 231 0 208 -1 221 -20 242 -12 12 -25 22 -29 22 -5 0 -11 9 -14 21 -3 12 -10 18 -17 14 -6 -3 -9 -2 -8 3 2 6 0 10 -4 11 -14 2 -45 36 -41 44 2 4 0 7 -6 7 -6 0 -22 12 -36 28 -14 15 -29 27 -33 27 -4 0 -31 24 -60 53 -30 28 -57 52 -61 52 -4 0 -16 -9 -27 -21z"
                initial={{ pathLength: 0, opacity: 0 }}
                animate={{ pathLength: 1, opacity: 1 }}
                transition={{ duration: 1.2, ease: 'easeInOut', delay: 0.6 }}
              />
            </g>
          </motion.svg>
        </div>

        {/* Brand Text Block with Generous Top Margin */}
        <div className="text-group">
          <motion.h1
            initial={{ opacity: 0, y: 15, filter: 'blur(8px)' }}
            animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
            transition={{ delay: 1.6, duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
            className="text-lg sm:text-2xl font-bold text-white uppercase tracking-[0.18em]"
          >
            The Marketing Haven
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 2.1, duration: 0.5 }}
            className="mt-2 text.xs sm:text-xs text-gray-400 font-medium tracking-[0.3em] uppercase"
          >
            Architecting Digital Growth
          </motion.p>
        </div>

        {/* Progress Line with Clear Vertical Clearance */}
        <div className="progress-bar-bg">
          <motion.div
            className="progress-bar-fill"
            initial={{ width: '0%' }}
            animate={{ width: '100%' }}
            transition={{ delay: 2.4, duration: 1.4, ease: 'easeInOut' }}
          />
        </div>
      </div>
    </motion.div>
  );
}