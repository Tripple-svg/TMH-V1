// src/components/Footer.jsx
import React from 'react';
import { ArrowUpRight } from 'lucide-react';

export default function Footer({ onOpenReview }) {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="relative w-full border-t border-white/10 bg-[#09090b] text-gray-400 py-12 sm:py-16 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-8 text-center md:text-left">
        
        {/* Brand Info */}
        <div className="space-y-2">
          <h3 className="text-xl font-bold text-white tracking-wider">
            THE MARKETING HAVEN
          </h3>
          <p className="text-xs text-gray-500 max-w-xs font-light">
            Digital marketing & brand strategy agency built on systems, clarity, and performance.
          </p>
        </div>

        {/* Quick Links */}
        <div className="flex flex-wrap items-center justify-center gap-6 text-xs text-gray-300 font-medium">
          <a href="#hero" className="hover:text-blue-400 transition-colors">Home</a>
          <a href="#services" className="hover:text-blue-400 transition-colors">Services</a>
          <a href="#free-class" className="hover:text-blue-400 transition-colors">Free Class</a>
          <a href="#about" className="hover:text-blue-400 transition-colors">About</a>
          <button 
            onClick={onOpenReview} 
            className="hover:text-blue-400 transition-colors text-blue-400 font-semibold flex items-center gap-1"
          >
            Brand Review <ArrowUpRight className="w-3 h-3" />
          </button>
        </div>

        {/* Copyright */}
        <div className="text-xs text-gray-600 font-mono">
          © {currentYear} The Marketing Haven. All rights reserved.
        </div>

      </div>
    </footer>
  );
}