import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TextInput,
  TouchableOpacity, Alert, FlatList, Modal, ActivityIndicator
} from 'react-native';
import * as Location from 'expo-location';
import { 
  getAcceptedQuotes, getTimesheets, startTimesheet, logTimesheetEvent, updateTimesheet 
} from '../services/api';
import { Card, Button, Input } from '../components/UI';
import CreateJobModal from '../components/CreateJobModal';
import { colors, spacing, radius, shadow } from '../utils/theme';

export default function TimesheetScreen({ route, navigation }) {
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [jobs, setJobs] = useState([]);
  const [selectedJob, setSelectedJob] = useState(null);
  
  const [taskName, setTaskName] = useState('');
  const [notes, setNotes] = useState('');
  const [logs, setLogs] = useState([]);
  
  const [activeSession, setActiveSession] = useState(null);
  
  // Custom Dropdown modal state
  const [dropdownVisible, setDropdownVisible] = useState(false);
  const [showCreateJobModal, setShowCreateJobModal] = useState(false);
  const [toastMsg, setToastMsg] = useState('');
  const toastTimerRef = React.useRef(null);
  const flatListRef = React.useRef(null);
  const selectedJobRef = React.useRef(selectedJob);
  const lastSavedRef = React.useRef({ taskName: '', notes: '' });

  useEffect(() => {
    selectedJobRef.current = selectedJob;
  }, [selectedJob]);

  const showToast = (msg) => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToastMsg(msg);
    toastTimerRef.current = setTimeout(() => setToastMsg(''), 3500);
  };

  useEffect(() => {
    fetchInitialData();
    return () => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    };
  }, []);

  const fetchInitialData = async (preserveJobId = null, silent = false) => {
    try {
      if (!silent) setLoading(true);
      
      // Fetch accepted quotes for dropdown
      const acceptedQuotes = await getAcceptedQuotes();
      setJobs(acceptedQuotes);
      
      // Fetch timesheet history for list
      const timesheetHistory = await getTimesheets();
      setLogs(timesheetHistory);
      
      // Find if there is an active session (status is 'working' or 'paused')
      const active = timesheetHistory.find(item => item.status !== 'stopped');
      if (active) {
        setActiveSession(active);
        // Pre-fill active session fields
        const matchingJob = acceptedQuotes.find(j => j.id === active.quote_id);
        if (matchingJob) setSelectedJob(matchingJob);
        setTaskName(active.task_name || '');
        setNotes(active.notes || '');
        lastSavedRef.current = { taskName: (active.task_name || '').trim(), notes: (active.notes || '').trim() };
      } else {
        setActiveSession(null);
        // Retain the job that was just worked on, or preselected, or existing selection
        const targetJobId = preserveJobId || selectedJobRef.current?.id || route?.params?.preselectedJobId;
        if (targetJobId) {
          const matching = acceptedQuotes.find(j => j.id === targetJobId);
          if (matching) {
            setSelectedJob(matching);
          }
        }
        setTaskName('');
        setNotes('');
        lastSavedRef.current = { taskName: '', notes: '' };
      }
    } catch (err) {
      console.warn('Failed to load timesheet details:', err);
    } finally {
      if (!silent) setLoading(false);
    }
  };

  const handleJobCreated = (newJob) => {
    setJobs(prev => [newJob, ...prev.filter(j => j.id !== newJob.id)]);
    setSelectedJob(newJob);
    showToast(`⚡ Job "${newJob.job_name}" selected`);
    fetchInitialData(newJob.id, true);
  };

  const parseServerDate = (dateVal) => {
    if (!dateVal) return null;
    if (dateVal instanceof Date) return dateVal;
    let str = String(dateVal).trim();
    // If string is in format "YYYY-MM-DD HH:MM:SS" without Z or timezone offset, append Z because Postgres stores in UTC
    if (/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}/.test(str) && !str.endsWith('Z') && !/[+-]\d{2}:?\d{2}$/.test(str)) {
      str = str.replace(' ', 'T') + 'Z';
    }
    const d = new Date(str);
    return isNaN(d.getTime()) ? null : d;
  };

  const formatShiftTime = (dateVal) => {
    const d = parseServerDate(dateVal);
    if (!d) return '--:--';
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const formatShiftDate = (dateVal) => {
    const d = parseServerDate(dateVal);
    if (!d) return '';
    return d.toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' });
  };

  const calculateDuration = (events, status) => {
    if (!events || events.length === 0) return null;
    
    let totalMs = 0;
    let lastStart = null;
    
    const sorted = [...events].sort((a, b) => {
      const da = parseServerDate(a.created_at);
      const db = parseServerDate(b.created_at);
      return (da ? da.getTime() : 0) - (db ? db.getTime() : 0);
    });
    
    for (const ev of sorted) {
      const evTime = parseServerDate(ev.created_at);
      if (!evTime) continue;
      
      if (ev.event_type === 'start' || ev.event_type === 'resume') {
        lastStart = evTime.getTime();
      } else if (ev.event_type === 'pause' || ev.event_type === 'stop') {
        if (lastStart) {
          totalMs += (evTime.getTime() - lastStart);
          lastStart = null;
        }
      }
    }
    
    if (status === 'working' && lastStart) {
      totalMs += (Date.now() - lastStart);
    }
    
    if (totalMs <= 0) return null;
    
    const totalMins = Math.round(totalMs / 60000);
    const hours = Math.floor(totalMins / 60);
    const mins = totalMins % 60;
    
    if (hours > 0 && mins > 0) return `${hours}h ${mins}m`;
    if (hours > 0) return `${hours}h`;
    return `${mins}m`;
  };

  const handleStartFromLog = async (item) => {
    if (activeSession) {
      if (activeSession.quote_id === item.quote_id) {
        showToast(`⚠️ You are currently clocked in on "${item.job_name}".`);
      } else {
        showToast('⚠️ Active shift running. Clock out of current shift first.');
      }
      return;
    }

    const matchingJob = jobs.find(j => j.id === item.quote_id) || {
      id: item.quote_id,
      job_name: item.job_name,
      client_name: item.client_name,
      is_direct_job: item.is_direct_job
    };

    setSelectedJob(matchingJob);
    setTaskName('');
    setNotes('');
    
    // Actually start the shift immediately!
    await handleStart(matchingJob);
  };

  const getGPSLocation = async () => {
    try {
      // Race against a short 3s timeout so desktop web or denied permissions never hang or freeze
      const locationPromise = (async () => {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') return null;
        const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        return {
          latitude: loc.coords.latitude,
          longitude: loc.coords.longitude
        };
      })();

      const timeoutPromise = new Promise(resolve => setTimeout(() => resolve(null), 3000));
      const res = await Promise.race([locationPromise, timeoutPromise]);
      return res || { latitude: null, longitude: null };
    } catch (err) {
      console.warn('GPS location unavailable, continuing without GPS:', err);
      return { latitude: null, longitude: null };
    }
  };

  const handleStart = async (jobOverride = null) => {
    // Only use jobOverride if it's an explicit job object (not a synthetic click event)
    const validOverride = (jobOverride && typeof jobOverride === 'object' && (jobOverride.id || jobOverride.quote_id)) ? jobOverride : null;
    const job = validOverride || selectedJob || selectedJobRef.current;
    const targetQuoteId = job?.id || job?.quote_id;

    if (!job || !targetQuoteId) {
      showToast('⚠️ Please select a Job Name first.');
      return;
    }
    
    setActionLoading(true);
    try {
      const coords = await getGPSLocation();
      
      const payload = {
        quote_id: targetQuoteId,
        task_name: taskName,
        notes: notes,
        latitude: coords?.latitude || null,
        longitude: coords?.longitude || null
      };
      
      await startTimesheet(payload);
      lastSavedRef.current = { taskName: (taskName || '').trim(), notes: (notes || '').trim() };
      showToast(`🚀 Clocked in on "${job.job_name || 'Job'}"`);
      if (typeof window !== 'undefined' && window.scrollTo) {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
      flatListRef.current?.scrollToOffset({ offset: 0, animated: true });
      await fetchInitialData(targetQuoteId, true);
    } catch (err) {
      const errMsg = err.response?.data?.error || err.message || 'Failed to start shift';
      showToast(`❌ ${errMsg}`);
    } finally {
      setActionLoading(false);
    }
  };

  const handleEvent = async (eventType) => {
    if (!activeSession) return;
    
    setActionLoading(true);
    try {
      const coords = await getGPSLocation();
      
      const payload = {
        event_type: eventType,
        latitude: coords?.latitude || null,
        longitude: coords?.longitude || null,
        task_name: taskName,
        notes: notes
      };
      
      const currentJobId = activeSession.quote_id || selectedJob?.id;
      const currentJobName = selectedJob?.job_name || 'job';

      await logTimesheetEvent(activeSession.id, payload);
      
      if (eventType === 'stop') {
        lastSavedRef.current = { taskName: '', notes: '' };
        showToast(`🛑 Clocked out. Ready for next shift on "${currentJobName}"`);
        await fetchInitialData(currentJobId, true);
      } else {
        lastSavedRef.current = { taskName: (taskName || '').trim(), notes: (notes || '').trim() };
        const label = eventType === 'pause' ? '☕ Break started (paused)' : '🛠️ Work resumed';
        showToast(label);
        await fetchInitialData(null, true);
      }
    } catch (err) {
      const errMsg = err.response?.data?.error || err.message || 'Failed to log event';
      showToast(`❌ ${errMsg}`);
    } finally {
      setActionLoading(false);
    }
  };

  const handleAutoSave = async () => {
    if (!activeSession) return;
    const currentTask = (taskName || '').trim();
    const currentNotes = (notes || '').trim();
    
    // Check if anything actually changed compared to last saved
    if (currentTask === (lastSavedRef.current.taskName || '') && currentNotes === (lastSavedRef.current.notes || '')) {
      return;
    }

    try {
      await updateTimesheet(activeSession.id, {
        task_name: currentTask,
        notes: currentNotes
      });
      lastSavedRef.current = { taskName: currentTask, notes: currentNotes };
      showToast('💾 Auto-saved task & notes');
      setActiveSession(prev => prev ? { ...prev, task_name: currentTask, notes: currentNotes } : null);
      setLogs(prev => prev.map(item => item.id === activeSession.id ? { ...item, task_name: currentTask, notes: currentNotes } : item));
    } catch (err) {
      console.warn('Auto-save error:', err);
      showToast('⚠️ Could not auto-save changes');
    }
  };

  const renderLogItem = ({ item }) => {
    const startEvent = item.events?.find(e => e.event_type === 'start');
    const stopEvent = item.events?.find(e => e.event_type === 'stop');
    const dateStr = formatShiftDate(item.created_at);
    const startTimeStr = startEvent ? formatShiftTime(startEvent.created_at) : '--:--';
    const stopTimeStr = stopEvent ? formatShiftTime(stopEvent.created_at) : (item.status === 'working' ? 'In Progress' : 'Paused');
    const durationStr = calculateDuration(item.events, item.status);
    const isThisActive = activeSession?.id === item.id;

    return (
      <Card style={[styles.logCard, isThisActive && styles.activeLogCard]}>
        <View style={styles.logHeader}>
          <Text style={styles.logDate}>{dateStr}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            {durationStr ? (
              <View style={styles.durationBadge}>
                <Text style={styles.durationBadgeText}>⏱️ {durationStr}</Text>
              </View>
            ) : null}
            <Text style={[styles.logStatus, styles[`status_${item.status}`]]}>
              {item.status.toUpperCase()}
            </Text>
          </View>
        </View>

        <Text style={styles.logJob}>{item.job_name}</Text>
        <Text style={styles.logClient}>Client: {item.client_name || 'N/A'}</Text>
        
        <View style={styles.shiftTimesRow}>
          <Text style={styles.shiftTimeLabel}>Shift Time:</Text>
          <Text style={styles.shiftTimeVal}>{startTimeStr} → {stopTimeStr}</Text>
        </View>

        {item.task_name ? <Text style={styles.logField}>Task: <Text style={styles.logText}>{item.task_name}</Text></Text> : null}
        {item.notes ? <Text style={styles.logField}>Notes: <Text style={styles.logText}>{item.notes}</Text></Text> : null}
        
        {item.events && item.events.length > 0 && (
          <View style={styles.eventTimeline}>
            <Text style={styles.timelineTitle}>Timeline Events:</Text>
            {item.events.map((e) => {
              const time = formatShiftTime(e.created_at);
              return (
                <View key={e.id} style={styles.timelineRow}>
                  <Text style={styles.timelineDot}>•</Text>
                  <Text style={styles.timelineEventText}>
                    {e.event_type.toUpperCase()} at {time}
                    {e.latitude ? ` (${e.latitude.toFixed(4)}, ${e.longitude.toFixed(4)})` : ''}
                  </Text>
                </View>
              );
            })}
          </View>
        )}

        {/* Card action */}
        {isThisActive ? (
          <View style={styles.activeShiftIndicator}>
            <Text style={styles.activeShiftText}>🟢 This shift is currently active above</Text>
          </View>
        ) : (
          <TouchableOpacity 
            style={styles.logCardActionBtn}
            onPress={() => handleStartFromLog(item)}
            activeOpacity={0.8}
          >
            <Text style={styles.logCardActionText}>🚀 Start New Shift on this Job</Text>
          </TouchableOpacity>
        )}
      </Card>
    );
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={{ marginTop: 10, color: colors.textSecondary }}>Loading Timesheets...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        ref={flatListRef}
        data={logs}
        keyExtractor={item => item.id}
        renderItem={renderLogItem}
        ListHeaderComponent={
          <>
            <Card style={styles.actionCard}>
              <Text style={styles.sectionTitle}>Timesheet Entry</Text>
              
              {toastMsg ? (
                <View style={styles.toastBanner}>
                  <Text style={styles.toastText}>{toastMsg}</Text>
                </View>
              ) : null}

              {/* Job Dropdown selector */}
              <View style={styles.labelRow}>
                <Text style={styles.label}>Job Name *</Text>
                {!activeSession && (
                  <TouchableOpacity onPress={() => setShowCreateJobModal(true)}>
                    <Text style={styles.newJobLink}>＋ New Job</Text>
                  </TouchableOpacity>
                )}
              </View>
              <TouchableOpacity 
                style={[styles.dropdownTrigger, activeSession && styles.disabledInput]} 
                onPress={() => !activeSession && setDropdownVisible(true)}
                disabled={!!activeSession}
              >
                <Text style={[styles.dropdownTriggerText, !selectedJob && { color: colors.textSecondary }]}>
                  {selectedJob 
                    ? `${selectedJob.is_direct_job ? '🛠️ ' : '📋 '}${selectedJob.job_name}` 
                    : 'Select Job for Timesheet...'}
                </Text>
                {!activeSession && <Text style={styles.dropdownArrow}>▼</Text>}
              </TouchableOpacity>

              {/* Client Name (derived, read-only) */}
              <Text style={styles.label}>Client Name</Text>
              <TextInput 
                style={[styles.input, styles.disabledInput]} 
                value={selectedJob ? selectedJob.client_name : ''} 
                editable={false} 
                placeholder="Client name will auto-populate"
                placeholderTextColor={colors.textSecondary}
              />

              {/* Task name text input */}
              <View style={styles.labelRow}>
                <Text style={styles.label}>Task</Text>
                {activeSession && <Text style={styles.autoSaveHint}>Auto-saves on blur</Text>}
              </View>
              <TextInput 
                style={styles.input} 
                value={taskName} 
                onChangeText={setTaskName} 
                onBlur={handleAutoSave}
                placeholder="What task are you working on?"
                placeholderTextColor={colors.textSecondary}
              />

              {/* Notes text input */}
              <View style={styles.labelRow}>
                <Text style={styles.label}>Notes</Text>
                {activeSession && <Text style={styles.autoSaveHint}>Auto-saves on blur</Text>}
              </View>
              <TextInput 
                style={[styles.input, { height: 60 }]} 
                value={notes} 
                onChangeText={setNotes} 
                onBlur={handleAutoSave}
                placeholder="Optional notes..."
                placeholderTextColor={colors.textSecondary}
                multiline
                textAlignVertical="top"
              />

              {/* Timer status banner */}
              {activeSession && (
                <View style={[styles.statusBanner, styles[`banner_${activeSession.status}`]]}>
                  <Text style={styles.statusBannerText}>
                    Status: {activeSession.status.toUpperCase()}
                  </Text>
                </View>
              )}

              {/* Controls */}
              <View style={styles.buttonContainer}>
                {!activeSession ? (
                  // Clock in button
                  <Button 
                    title={selectedJob ? "🚀 Start Shift" : "🚀 Start Work"} 
                    onPress={() => handleStart()} 
                    loading={actionLoading}
                    variant="primary" 
                    style={{ flex: 1 }}
                    disabled={!selectedJob}
                  />
                ) : (
                  <>
                    {/* Pause / Resume action */}
                    {activeSession.status === 'working' ? (
                      <Button 
                        title="☕ Pause (Break)" 
                        onPress={() => handleEvent('pause')} 
                        loading={actionLoading}
                        variant="warning" 
                        style={{ flex: 1 }}
                      />
                    ) : (
                      <Button 
                        title="🛠️ Resume Work" 
                        onPress={() => handleEvent('resume')} 
                        loading={actionLoading}
                        variant="success" 
                        style={{ flex: 1 }}
                      />
                    )}
                    
                    {/* Stop action */}
                    <Button 
                      title="🛑 Clock Out (End Shift)" 
                      onPress={() => handleEvent('stop')} 
                      loading={actionLoading}
                      variant="danger" 
                      style={{ flex: 1 }}
                    />
                  </>
                )}
              </View>
            </Card>

            <Text style={styles.historyTitle}>Timesheet Logs</Text>
          </>
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>No timesheets logged yet</Text>
          </View>
        }
        contentContainerStyle={styles.scrollContainer}
      />

      {/* Custom Dropdown Modal Selector */}
      <Modal
        visible={dropdownVisible}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setDropdownVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeaderRow}>
              <Text style={styles.modalTitle}>Select Job</Text>
              <TouchableOpacity 
                style={styles.modalNewJobBtn}
                onPress={() => {
                  setDropdownVisible(false);
                  setShowCreateJobModal(true);
                }}
              >
                <Text style={styles.modalNewJobBtnText}>＋ New Job</Text>
              </TouchableOpacity>
            </View>
            <FlatList
              data={jobs}
              keyExtractor={item => item.id}
              renderItem={({ item }) => (
                <TouchableOpacity 
                  style={styles.modalItem}
                  onPress={() => {
                    setSelectedJob(item);
                    setDropdownVisible(false);
                  }}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <Text style={{ marginRight: 6, fontSize: 16 }}>{item.is_direct_job ? '🛠️' : '📋'}</Text>
                    <Text style={styles.modalItemName}>{item.job_name}</Text>
                    <View style={[styles.jobTypeTag, item.is_direct_job ? styles.directTag : styles.quoteTag]}>
                      <Text style={[styles.jobTypeTagText, item.is_direct_job ? styles.directTagText : styles.quoteTagText]}>
                        {item.is_direct_job ? 'Direct Job' : 'Quote'}
                      </Text>
                    </View>
                  </View>
                  <Text style={styles.modalItemClient}>{item.client_name ? `Client: ${item.client_name}` : 'No Client'}</Text>
                </TouchableOpacity>
              )}
              ListEmptyComponent={
                <View style={{ alignItems: 'center', paddingVertical: spacing.lg }}>
                  <Text style={styles.emptyModalText}>No active jobs available</Text>
                  <TouchableOpacity 
                    style={[styles.modalNewJobBtn, { marginTop: spacing.sm }]}
                    onPress={() => {
                      setDropdownVisible(false);
                      setShowCreateJobModal(true);
                    }}
                  >
                    <Text style={styles.modalNewJobBtnText}>＋ Create Your First Job</Text>
                  </TouchableOpacity>
                </View>
              }
            />
            <Button 
              title="Close" 
              onPress={() => setDropdownVisible(false)} 
              variant="outline" 
              style={{ marginTop: spacing.md }}
            />
          </View>
        </View>
      </Modal>

      {/* Direct Job Creation Modal */}
      <CreateJobModal
        visible={showCreateJobModal}
        onClose={() => setShowCreateJobModal(false)}
        onJobCreated={handleJobCreated}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollContainer: {
    padding: spacing.md,
  },
  actionCard: {
    padding: spacing.md,
    marginBottom: spacing.lg,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: colors.text,
    marginBottom: spacing.md,
    fontFamily: 'Outfit',
  },
  label: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textSecondary,
    marginBottom: 4,
  },
  dropdownTrigger: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 10,
    backgroundColor: '#fff',
    marginBottom: spacing.md,
  },
  dropdownTriggerText: {
    fontSize: 15,
    color: colors.text,
  },
  dropdownArrow: {
    fontSize: 12,
    color: colors.textSecondary,
  },
  input: {
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 8,
    fontSize: 15,
    color: colors.text,
    backgroundColor: '#fff',
    marginBottom: spacing.md,
  },
  disabledInput: {
    backgroundColor: '#f3f4f6',
    borderColor: colors.border,
    color: colors.textSecondary,
  },
  statusBanner: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: radius.sm,
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  statusBannerText: {
    fontWeight: '700',
    fontSize: 13,
  },
  banner_working: { backgroundColor: '#dbeafe', color: '#1d4ed8' },
  banner_paused: { backgroundColor: '#fef3c7', color: '#d97706' },
  buttonContainer: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  historyTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.text,
    marginBottom: spacing.md,
    fontFamily: 'Outfit',
  },
  logCard: {
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  logHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  logDate: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.textSecondary,
  },
  logStatus: {
    fontSize: 10,
    fontWeight: '800',
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 2,
    overflow: 'hidden',
  },
  status_working: { backgroundColor: '#dbeafe', color: '#1d4ed8' },
  status_paused: { backgroundColor: '#fef3c7', color: '#d97706' },
  status_stopped: { backgroundColor: '#f3f4f6', color: '#475569' },
  logJob: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.text,
  },
  logClient: {
    fontSize: 13,
    color: colors.textSecondary,
    marginBottom: 8,
  },
  logField: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.textSecondary,
    marginBottom: 2,
  },
  logText: {
    fontWeight: '400',
    color: colors.text,
  },
  eventTimeline: {
    marginTop: spacing.md,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  timelineTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textSecondary,
    marginBottom: 6,
  },
  timelineRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 4,
  },
  timelineDot: {
    fontSize: 14,
    color: colors.primary,
    marginRight: 6,
    lineHeight: 14,
  },
  timelineEventText: {
    fontSize: 12,
    color: colors.text,
    flex: 1,
  },
  emptyContainer: {
    padding: spacing.xl,
    alignItems: 'center',
  },
  emptyText: {
    color: colors.textSecondary,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.background,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#fff',
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    padding: spacing.md,
    maxHeight: '60%',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.text,
    marginBottom: spacing.md,
    fontFamily: 'Outfit',
    textAlign: 'center',
  },
  modalItem: {
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  modalItemName: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
  },
  modalItemClient: {
    fontSize: 13,
    color: colors.textSecondary,
    marginTop: 2,
  },
  emptyModalText: {
    textAlign: 'center',
    color: colors.textSecondary,
    paddingVertical: spacing.lg,
  },
  labelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  newJobLink: {
    fontSize: 13,
    color: colors.primary,
    fontWeight: '700',
  },
  autoSaveHint: {
    fontSize: 11,
    color: colors.textSecondary,
    fontStyle: 'italic',
  },
  modalHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  modalNewJobBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.sm,
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: colors.primary,
  },
  modalNewJobBtnText: {
    fontSize: 13,
    color: colors.primary,
    fontWeight: '700',
  },
  jobTypeTag: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    marginLeft: 8,
  },
  directTag: {
    backgroundColor: '#E0F2FE',
  },
  quoteTag: {
    backgroundColor: '#F3F4F6',
  },
  jobTypeTagText: {
    fontSize: 10,
    fontWeight: '700',
  },
  directTagText: {
    color: '#0369A1',
  },
  quoteTagText: {
    color: '#4B5563',
  },
  toastBanner: {
    backgroundColor: '#ECFDF5',
    borderColor: '#10B981',
    borderWidth: 1.5,
    borderRadius: radius.sm,
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginBottom: spacing.md,
    alignItems: 'center',
  },
  toastText: {
    color: '#065F46',
    fontSize: 14,
    fontWeight: '700',
  },
  durationBadge: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  durationBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.primary,
  },
  activeLogCard: {
    borderColor: colors.primary,
    borderWidth: 1.5,
  },
  shiftTimesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
    paddingVertical: 2,
  },
  shiftTimeLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textSecondary,
    marginRight: 6,
  },
  shiftTimeVal: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.text,
  },
  logCardActionBtn: {
    marginTop: spacing.md,
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: colors.primary,
    borderRadius: radius.sm,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
  },
  logCardActionText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  activeShiftIndicator: {
    marginTop: spacing.sm,
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: '#DCFCE7',
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: '#86EFAC',
    alignItems: 'center',
  },
  activeShiftText: {
    color: '#15803D',
    fontSize: 12,
    fontWeight: '700',
  },
});
