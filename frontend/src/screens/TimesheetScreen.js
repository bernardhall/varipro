import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TextInput,
  TouchableOpacity, Alert, FlatList, Modal, ActivityIndicator
} from 'react-native';
import * as Location from 'expo-location';
import { 
  getAcceptedQuotes, getTimesheets, startTimesheet, logTimesheetEvent 
} from '../services/api';
import { Card, Button, Input } from '../components/UI';
import { colors, spacing, radius, shadow } from '../utils/theme';

export default function TimesheetScreen({ navigation }) {
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

  useEffect(() => {
    fetchInitialData();
  }, []);

  const fetchInitialData = async () => {
    try {
      setLoading(true);
      
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
      } else {
        setActiveSession(null);
        setSelectedJob(null);
        setTaskName('');
        setNotes('');
      }
    } catch (err) {
      Alert.alert('Error', 'Failed to load timesheet details: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const getGPSLocation = async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Location Permission Denied', 'Location coordinates are required to sign on or off. Please enable location permissions in your settings.');
        return null;
      }
      
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      return {
        latitude: loc.coords.latitude,
        longitude: loc.coords.longitude
      };
    } catch (err) {
      console.warn('GPS error:', err);
      // Return null rather than failing entirely, or restrict depending on policy.
      return null;
    }
  };

  const handleStart = async () => {
    if (!selectedJob) {
      Alert.alert('Error', 'Please select a Job Name first.');
      return;
    }
    
    setActionLoading(true);
    try {
      const coords = await getGPSLocation();
      if (!coords) {
        setActionLoading(false);
        return; // Stopped due to permission
      }
      
      const payload = {
        quote_id: selectedJob.id,
        task_name: taskName,
        notes: notes,
        latitude: coords.latitude,
        longitude: coords.longitude
      };
      
      await startTimesheet(payload);
      Alert.alert('Success', 'Clocked in successfully!');
      await fetchInitialData();
    } catch (err) {
      Alert.alert('Error', err.response?.data?.error || err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleEvent = async (eventType) => {
    if (!activeSession) return;
    
    setActionLoading(true);
    try {
      const coords = await getGPSLocation();
      if (!coords) {
        setActionLoading(false);
        return; // Stopped due to permission
      }
      
      const payload = {
        event_type: eventType,
        latitude: coords.latitude,
        longitude: coords.longitude,
        task_name: taskName,
        notes: notes
      };
      
      await logTimesheetEvent(activeSession.id, payload);
      
      const label = eventType === 'pause' ? 'Break started (paused)' : eventType === 'resume' ? 'Work resumed' : 'Clocked out (stopped)';
      Alert.alert('Success', `${label} successfully logged!`);
      await fetchInitialData();
    } catch (err) {
      Alert.alert('Error', err.response?.data?.error || err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const renderLogItem = ({ item }) => {
    // Format start and stop times
    const startEvent = item.events?.find(e => e.event_type === 'start');
    const stopEvent = item.events?.find(e => e.event_type === 'stop');
    const dateStr = new Date(item.created_at).toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' });
    
    const startTimeStr = startEvent ? new Date(startEvent.created_at).toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' }) : '--:--';
    const stopTimeStr = stopEvent ? new Date(stopEvent.created_at).toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' }) : 'Active';

    return (
      <Card style={styles.logCard}>
        <View style={styles.logHeader}>
          <Text style={styles.logDate}>{dateStr}</Text>
          <Text style={[styles.logStatus, styles[`status_${item.status}`]]}>{item.status.toUpperCase()}</Text>
        </View>
        <Text style={styles.logJob}>{item.job_name}</Text>
        <Text style={styles.logClient}>Client: {item.client_name || 'N/A'}</Text>
        
        {item.task_name ? <Text style={styles.logField}>Task: <Text style={styles.logText}>{item.task_name}</Text></Text> : null}
        {item.notes ? <Text style={styles.logField}>Notes: <Text style={styles.logText}>{item.notes}</Text></Text> : null}
        
        <View style={styles.eventTimeline}>
          <Text style={styles.timelineTitle}>Timeline Events:</Text>
          {item.events?.map((e, idx) => {
            const time = new Date(e.created_at).toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' });
            return (
              <View key={e.id} style={styles.timelineRow}>
                <Text style={styles.timelineDot}>•</Text>
                <Text style={styles.timelineEventText}>
                  {e.event_type.toUpperCase()} at {time} 
                  {e.latitude ? ` (Location: ${e.latitude.toFixed(4)}, ${e.longitude.toFixed(4)})` : ''}
                </Text>
              </View>
            );
          })}
        </View>
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
        data={logs}
        keyExtractor={item => item.id}
        renderItem={renderLogItem}
        ListHeaderComponent={
          <>
            <Card style={styles.actionCard}>
              <Text style={styles.sectionTitle}>Timesheet Entry</Text>
              
              {/* Job Dropdown selector */}
              <Text style={styles.label}>Job Name *</Text>
              <TouchableOpacity 
                style={[styles.dropdownTrigger, activeSession && styles.disabledInput]} 
                onPress={() => !activeSession && setDropdownVisible(true)}
                disabled={!!activeSession}
              >
                <Text style={[styles.dropdownTriggerText, !selectedJob && { color: colors.textSecondary }]}>
                  {selectedJob ? selectedJob.job_name : 'Select Accepted Job...'}
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
              <Text style={styles.label}>Task</Text>
              <TextInput 
                style={styles.input} 
                value={taskName} 
                onChangeText={setTaskName} 
                placeholder="What task are you working on?"
                placeholderTextColor={colors.textSecondary}
              />

              {/* Notes text input */}
              <Text style={styles.label}>Notes</Text>
              <TextInput 
                style={[styles.input, { height: 60 }]} 
                value={notes} 
                onChangeText={setNotes} 
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
                    title="🚀 Start Work" 
                    onPress={handleStart} 
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
                      title="🛑 Stop (End Day)" 
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
            <Text style={styles.modalTitle}>Select Accepted Job</Text>
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
                  <Text style={styles.modalItemName}>{item.job_name}</Text>
                  <Text style={styles.modalItemClient}>{item.client_name || 'N/A'}</Text>
                </TouchableOpacity>
              )}
              ListEmptyComponent={
                <Text style={styles.emptyModalText}>No accepted jobs available</Text>
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
});
