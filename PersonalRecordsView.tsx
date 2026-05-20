import React, { useState } from 'react';
import { format } from 'date-fns';
import { Activity, Plus, Tag, Share2, Trash2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export default function PersonalRecordsView({ prs, sessions, onAddPr, onDeletePr, onShare }: any) {
  const [isAdding, setIsAdding] = useState(false);
  const [formData, setFormData] = useState({
    exercise: '',
    weight: '',
    unit: 'lbs',
    muscleGroup: 'Chest',
    sessionId: ''
  });

  const muscleGroups = ['Chest', 'Back', 'Legs', 'Shoulders', 'Arms', 'Core', 'Full Body'];

  const handleSubmit = (e: any) => {
    e.preventDefault();
    if (!formData.exercise || !formData.weight) return;
    
    onAddPr({
      exercise: formData.exercise,
      weight: parseFloat(formData.weight),
      unit: formData.unit,
      muscleGroup: formData.muscleGroup,
      sessionId: formData.sessionId || undefined,
      date: new Date().toISOString()
    });
    
    setIsAdding(false);
    setFormData({ exercise: '', weight: '', unit: 'lbs', muscleGroup: 'Chest', sessionId: '' });
  };

  const groupedPrs = prs.reduce((acc: any, pr: any) => {
    acc[pr.muscleGroup] = acc[pr.muscleGroup] || [];
    acc[pr.muscleGroup].push(pr);
    return acc;
  }, {});

  return (
    <div className="h-full flex flex-col p-4 lg:p-12 overflow-y-auto custom-scrollbar">
      <div className="flex items-center justify-between mb-8">
         <div>
            <h1 className="text-3xl lg:text-5xl font-black uppercase tracking-tighter text-white flex items-center gap-4">
              <Activity className="text-yellow-500 w-8 h-8 lg:w-12 lg:h-12" />
              Personal Records
            </h1>
            <p className="text-dark-text-muted mt-2 tracking-widest text-[10px] lg:text-xs font-bold uppercase block">Track your best lifts and continuous progress.</p>
         </div>
         <button 
           onClick={() => setIsAdding(!isAdding)}
           className="bg-brand-primary text-white p-4 rounded-2xl shadow-lg hover:scale-105 transition-all flex items-center justify-center font-black"
         >
            <Plus size={24} />
         </button>
      </div>

      <AnimatePresence>
        {isAdding && (
          <motion.form 
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            onSubmit={handleSubmit}
            className="mb-8 bg-dark-surface border border-dark-border rounded-3xl p-6 overflow-hidden"
          >
            <h2 className="text-lg font-black uppercase tracking-widest mb-4">Log New PR</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-4">
              <div>
                <label className="block text-[10px] font-bold text-dark-text-muted uppercase tracking-wider mb-2">Exercise</label>
                <input type="text" required value={formData.exercise} onChange={e => setFormData({...formData, exercise: e.target.value})} className="w-full bg-dark-bg border border-dark-border rounded-xl px-4 py-3 text-white focus:outline-none focus:border-brand-primary" placeholder="e.g. Bench Press" />
              </div>
              <div className="flex gap-2">
                <div className="flex-1">
                  <label className="block text-[10px] font-bold text-dark-text-muted uppercase tracking-wider mb-2">Weight</label>
                  <input type="number" required value={formData.weight} onChange={e => setFormData({...formData, weight: e.target.value})} className="w-full bg-dark-bg border border-dark-border rounded-xl px-4 py-3 text-white focus:outline-none focus:border-brand-primary" placeholder="0" />
                </div>
                <div className="w-24">
                  <label className="block text-[10px] font-bold text-dark-text-muted uppercase tracking-wider mb-2">Unit</label>
                  <select value={formData.unit} onChange={e => setFormData({...formData, unit: e.target.value})} className="w-full bg-dark-bg border border-dark-border rounded-xl px-4 py-3 text-white focus:outline-none focus:border-brand-primary">
                    <option value="lbs">lbs</option>
                    <option value="kg">kg</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-[10px] font-bold text-dark-text-muted uppercase tracking-wider mb-2">Muscle Group</label>
                <select value={formData.muscleGroup} onChange={e => setFormData({...formData, muscleGroup: e.target.value})} className="w-full bg-dark-bg border border-dark-border rounded-xl px-4 py-3 text-white focus:outline-none focus:border-brand-primary">
                  {muscleGroups.map(g => <option key={g} value={g}>{g}</option>)}
                </select>
              </div>
              <div className="md:col-span-2 lg:col-span-3">
                <label className="block text-[10px] font-bold text-dark-text-muted uppercase tracking-wider mb-2">Achieved During Session (Optional)</label>
                <select value={formData.sessionId} onChange={e => setFormData({...formData, sessionId: e.target.value})} className="w-full bg-dark-bg border border-dark-border rounded-xl px-4 py-3 text-white focus:outline-none focus:border-brand-primary">
                  <option value="">None</option>
                  {sessions.sort((a: any,b: any) => b.startTime.getTime() - a.startTime.getTime()).map((s: any) => (
                    <option key={s.id} value={s.id}>{s.title} ({format(s.startTime, 'MMM d, yyyy')})</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="flex justify-end gap-3">
              <button type="button" onClick={() => setIsAdding(false)} className="px-6 py-3 rounded-xl border border-dark-border text-dark-text-muted hover:bg-dark-bg hover:text-white transition-colors font-bold uppercase tracking-widest text-xs">Cancel</button>
              <button type="submit" className="px-6 py-3 rounded-xl bg-brand-primary text-white hover:brightness-110 transition-all font-black uppercase tracking-widest text-xs flex items-center gap-2">
                <Plus size={14} /> Add PR
              </button>
            </div>
          </motion.form>
        )}
      </AnimatePresence>

      <div className="space-y-12">
        {muscleGroups.filter(g => groupedPrs[g]).map(group => (
          <div key={group}>
            <h3 className="text-xl font-black uppercase tracking-widest text-white mb-6 border-b border-dark-border/50 pb-4">{group}</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {groupedPrs[group].sort((a: any,b: any) => new Date(b.date).getTime() - new Date(a.date).getTime()).map((pr: any) => {
                const session = sessions.find((s: any) => s.id === pr.sessionId);
                return (
                  <div key={pr.id} className="bg-dark-surface border border-dark-border rounded-3xl p-6 relative group hover:border-brand-primary/50 transition-colors">
                    <button 
                      onClick={() => onDeletePr(pr.id)}
                      className="absolute top-4 right-4 text-red-500/50 hover:text-red-500 hover:bg-red-500/10 p-2 rounded-lg opacity-0 group-hover:opacity-100 transition-all"
                    >
                      <Trash2 size={16} />
                    </button>
                    <button 
                      onClick={() => onShare(pr)}
                      className="absolute top-4 right-14 text-blue-500/50 hover:text-blue-500 hover:bg-blue-500/10 p-2 rounded-lg opacity-0 group-hover:opacity-100 transition-all"
                      title="Share in Chat"
                    >
                      <Share2 size={16} />
                    </button>
                    <div className="flex flex-col h-full">
                      <span className="text-sm font-bold text-dark-text-muted uppercase tracking-wider mb-2">{pr.exercise}</span>
                      <div className="text-4xl font-black text-white mb-4">
                        {pr.weight} <span className="text-lg text-brand-primary uppercase tracking-widest">{pr.unit}</span>
                      </div>
                      <div className="mt-auto pt-4 border-t border-dark-border flex flex-col gap-2">
                        <div className="flex justify-between items-center text-[10px] font-bold text-dark-text-muted uppercase tracking-widest">
                          <span>{format(new Date(pr.date), 'MMM d, yyyy')}</span>
                        </div>
                        {session && (
                          <div className="bg-brand-primary/10 text-brand-primary rounded-lg px-2 py-1.5 flex items-center gap-2">
                            <Tag size={12} />
                            <span className="text-[9px] font-black uppercase tracking-widest truncate">{session.title}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
        {prs.length === 0 && !isAdding && (
          <div className="text-center py-20 bg-dark-surface border border-dark-border border-dashed rounded-3xl">
            <Activity className="w-16 h-16 text-dark-text-muted/30 mx-auto mb-4" />
            <h3 className="text-xl font-black text-white uppercase tracking-widest mb-2">No PRs Yet</h3>
            <p className="text-dark-text-muted">Start tracking your personal records to see your progress.</p>
          </div>
        )}
      </div>
    </div>
  );
}
