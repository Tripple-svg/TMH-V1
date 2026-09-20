import React, { useEffect, useRef, memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X,
  AlertTriangle,
  Trash2,
  RotateCcw,
  Settings,
  Pin,
  Clock,
  User,
  BarChart3,
  Sparkles,
  CheckCircle2,
} from 'lucide-react';

/* ─────────────────────────── Overlay ─────────────────────────── */

const ModalOverlay = memo(function ModalOverlay({ onClose, children }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      onClick={onClose}
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
    >
      {children}
    </motion.div>
  );
});

/* ─────────────────────────── Delete Confirmation ─────────────────────────── */

const DeleteConfirmModal = memo(function DeleteConfirmModal({ onClose, onConfirm, currentSession }) {
  return (
    <ModalOverlay onClose={onClose}>
      <motion.div
        initial={{ opacity: 0, scale: 0.92, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.92, y: 8 }}
        transition={{ type: 'spring', stiffness: 400, damping: 30 }}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm rounded-2xl bg-slate-950/[0.97] border border-white/[0.07] shadow-2xl shadow-black/70 backdrop-blur-xl overflow-hidden"
      >
        {/* Header accent */}
        <div className="h-1 w-full bg-gradient-to-r from-red-500/40 via-red-400/20 to-transparent" />

        <div className="p-6 space-y-5">
          <div className="flex items-start gap-4">
            <div className="flex-shrink-0 flex items-center justify-center w-11 h-11 rounded-xl bg-red-500/10 border border-red-500/20">
              <AlertTriangle className="w-5 h-5 text-red-400" />
            </div>
            <div className="space-y-1">
              <h3 className="text-base font-semibold text-slate-100">Delete Chat Session</h3>
              <p className="text-sm text-slate-400 leading-relaxed">
                This will permanently remove <span className="text-slate-300 font-medium">"{currentSession?.title || 'this session'}"</span> and all its messages. This action cannot be undone.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 pt-1">
            <motion.button
              whileTap={{ scale: 0.96 }}
              onClick={onClose}
              className="flex-1 px-4 py-2.5 rounded-xl text-sm font-medium text-slate-300 bg-white/[0.04] border border-white/[0.06] hover:bg-white/[0.07] hover:text-slate-100 transition-all cursor-pointer"
            >
              Cancel
            </motion.button>
            <motion.button
              whileTap={{ scale: 0.96 }}
              onClick={() => {
                onConfirm();
                onClose();
              }}
              className="flex-1 px-4 py-2.5 rounded-xl text-sm font-medium text-white bg-red-600 hover:bg-red-500 shadow-lg shadow-red-600/15 transition-all cursor-pointer"
            >
              <span className="flex items-center justify-center gap-2">
                <Trash2 className="w-4 h-4" />
                Delete
              </span>
            </motion.button>
          </div>
        </div>
      </motion.div>
    </ModalOverlay>
  );
});

/* ─────────────────────────── Clear Confirmation ─────────────────────────── */

const ClearConfirmModal = memo(function ClearConfirmModal({ onClose, onConfirm }) {
  return (
    <ModalOverlay onClose={onClose}>
      <motion.div
        initial={{ opacity: 0, scale: 0.92, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.92, y: 8 }}
        transition={{ type: 'spring', stiffness: 400, damping: 30 }}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm rounded-2xl bg-slate-950/[0.97] border border-white/[0.07] shadow-2xl shadow-black/70 backdrop-blur-xl overflow-hidden"
      >
        <div className="h-1 w-full bg-gradient-to-r from-amber-500/40 via-amber-400/20 to-transparent" />

        <div className="p-6 space-y-5">
          <div className="flex items-start gap-4">
            <div className="flex-shrink-0 flex items-center justify-center w-11 h-11 rounded-xl bg-amber-500/10 border border-amber-500/20">
              <RotateCcw className="w-5 h-5 text-amber-400" />
            </div>
            <div className="space-y-1">
              <h3 className="text-base font-semibold text-slate-100">Clear Chat Messages</h3>
              <p className="text-sm text-slate-400 leading-relaxed">
                All messages in this session will be removed. The session itself will remain in your history.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 pt-1">
            <motion.button
              whileTap={{ scale: 0.96 }}
              onClick={onClose}
              className="flex-1 px-4 py-2.5 rounded-xl text-sm font-medium text-slate-300 bg-white/[0.04] border border-white/[0.06] hover:bg-white/[0.07] hover:text-slate-100 transition-all cursor-pointer"
            >
              Cancel
            </motion.button>
            <motion.button
              whileTap={{ scale: 0.96 }}
              onClick={() => {
                onConfirm();
                onClose();
              }}
              className="flex-1 px-4 py-2.5 rounded-xl text-sm font-medium text-white bg-amber-600 hover:bg-amber-500 shadow-lg shadow-amber-600/15 transition-all cursor-pointer"
            >
              <span className="flex items-center justify-center gap-2">
                <RotateCcw className="w-4 h-4" />
                Clear Messages
              </span>
            </motion.button>
          </div>
        </div>
      </motion.div>
    </ModalOverlay>
  );
});

/* ─────────────────────────── Settings / Session Info ─────────────────────────── */

const SettingsModal = memo(function SettingsModal({ onClose, currentSession, userProfile }) {
  const stats = [
    {
      label: 'Session ID',
      value: currentSession?.id ? `${currentSession.id.slice(0, 12)}...` : 'N/A',
      icon: Pin,
      color: 'text-violet-400',
      bg: 'bg-violet-500/10',
      border: 'border-violet-500/15',
    },
    {
      label: 'Created',
      value: currentSession?.createdAt
        ? new Date(currentSession.createdAt).toLocaleDateString()
        : 'Just now',
      icon: Clock,
      color: 'text-blue-400',
      bg: 'bg-blue-500/10',
      border: 'border-blue-500/15',
    },
    {
      label: 'User',
      value: userProfile?.name || 'Guest',
      icon: User,
      color: 'text-emerald-400',
      bg: 'bg-emerald-500/10',
      border: 'border-emerald-500/15',
    },
    {
      label: 'Audit Score',
      value: userProfile?.auditScore != null ? `${userProfile.auditScore}/100` : '—',
      icon: BarChart3,
      color: userProfile?.auditScore >= 80
        ? 'text-emerald-400'
        : userProfile?.auditScore >= 50
        ? 'text-amber-400'
        : 'text-red-400',
      bg: userProfile?.auditScore >= 80
        ? 'bg-emerald-500/10'
        : userProfile?.auditScore >= 50
        ? 'bg-amber-500/10'
        : 'bg-red-500/10',
      border: userProfile?.auditScore >= 80
        ? 'border-emerald-500/15'
        : userProfile?.auditScore >= 50
        ? 'border-amber-500/15'
        : 'border-red-500/15',
    },
  ];

  return (
    <ModalOverlay onClose={onClose}>
      <motion.div
        initial={{ opacity: 0, scale: 0.92, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.92, y: 8 }}
        transition={{ type: 'spring', stiffness: 400, damping: 30 }}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm rounded-2xl bg-slate-950/[0.97] border border-white/[0.07] shadow-2xl shadow-black/70 backdrop-blur-xl overflow-hidden"
      >
        <div className="h-1 w-full bg-gradient-to-r from-violet-500/40 via-fuchsia-400/20 to-transparent" />

        <div className="p-6 space-y-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-violet-500/10 border border-violet-500/20">
                <Settings className="w-5 h-5 text-violet-400" />
              </div>
              <div>
                <h3 className="text-base font-semibold text-slate-100">Session Info</h3>
                <p className="text-xs text-slate-500">Current chat details & context</p>
              </div>
            </div>
            <motion.button
              whileTap={{ scale: 0.9 }}
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-white/[0.05] transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </motion.button>
          </div>

          {/* Session Title */}
          <div className="p-3.5 rounded-xl bg-white/[0.03] border border-white/[0.05]">
            <span className="text-[10px] uppercase tracking-wider text-slate-500 font-medium">Session Name</span>
            <p className="text-sm text-slate-200 mt-1 font-medium">{currentSession?.title || 'Untitled Session'}</p>
          </div>

          {/* Stats Grid */}
          <div className="grid grid-cols-2 gap-2.5">
            {stats.map((stat) => {
              const Icon = stat.icon;
              return (
                <div
                  key={stat.label}
                  className={`p-3 rounded-xl ${stat.bg} border ${stat.border} space-y-1.5`}
                >
                  <div className="flex items-center gap-1.5">
                    <Icon className={`w-3 h-3 ${stat.color}`} />
                    <span className="text-[10px] uppercase tracking-wider text-slate-500 font-medium">
                      {stat.label}
                    </span>
                  </div>
                  <p className={`text-sm font-semibold ${stat.color}`}>{stat.value}</p>
                </div>
              );
            })}
          </div>

          {/* Business Domain */}
          {userProfile?.businessDomain && (
            <div className="p-3.5 rounded-xl bg-white/[0.03] border border-white/[0.05] flex items-center justify-between">
              <div>
                <span className="text-[10px] uppercase tracking-wider text-slate-500 font-medium">Business Domain</span>
                <p className="text-sm text-slate-200 mt-1 font-medium">{userProfile.businessDomain}</p>
              </div>
              <CheckCircle2 className="w-5 h-5 text-emerald-400/60" />
            </div>
          )}

          <motion.button
            whileTap={{ scale: 0.97 }}
            onClick={onClose}
            className="w-full px-4 py-2.5 rounded-xl text-sm font-medium text-slate-300 bg-white/[0.04] border border-white/[0.06] hover:bg-white/[0.07] hover:text-slate-100 transition-all cursor-pointer"
          >
            Close
          </motion.button>
        </div>
      </motion.div>
    </ModalOverlay>
  );
});

/* ─────────────────────────── Main Export ─────────────────────────── */

export default function ActionModals({ modalType, onClose, onConfirm, currentSession, userProfile }) {
  return (
    <AnimatePresence>
      {modalType === 'delete_confirm' && (
        <DeleteConfirmModal
          key="delete"
          onClose={onClose}
          onConfirm={onConfirm}
          currentSession={currentSession}
        />
      )}
      {modalType === 'clear_confirm' && (
        <ClearConfirmModal
          key="clear"
          onClose={onClose}
          onConfirm={onConfirm}
        />
      )}
      {modalType === 'settings' && (
        <SettingsModal
          key="settings"
          onClose={onClose}
          currentSession={currentSession}
          userProfile={userProfile}
        />
      )}
    </AnimatePresence>
  );
}