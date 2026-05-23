import React, { useState, useEffect, useRef } from 'react';
import { View, StyleSheet, Alert, TouchableOpacity, Text, SafeAreaView } from 'react-native';
import { useAuth } from '../hooks/useAuth';
import { LoadingScreen } from '../components/UI';
import { colors, spacing, radius } from '../utils/theme';
import api from '../services/api';
import { RichEditor, RichToolbar, actions } from 'react-native-pell-rich-editor';

export default function QuoteFooterSettingsScreen({ navigation }) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [footerHtml, setFooterHtml] = useState('');
  
  const richText = useRef(null);
  const htmlRef = useRef('');

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      const res = await api.get('/account/settings');
      if (res.data.quote_footer) {
        setFooterHtml(res.data.quote_footer);
        htmlRef.current = res.data.quote_footer;
      }
    } catch (err) {
      Alert.alert('Error', err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      
      // Get HTML *before* blurring to ensure WebView is still fully active
      let htmlToSave = await richText.current?.getContentHtml();
      
      // Fallback to the live ref if the async call returns undefined
      if (htmlToSave === undefined || htmlToSave === null) {
        htmlToSave = htmlRef.current;
      }

      await api.put('/account/settings', { quote_footer: htmlToSave });
      
      // Blur after successful save
      richText.current?.blurContentEditor();
      
      Alert.alert('Saved Data Debug', `HTML saved: ${htmlToSave}`, [
        { text: 'OK', onPress: () => navigation.goBack() }
      ]);
    } catch (err) {
      Alert.alert('Error', err.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <LoadingScreen />;

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.toolbarContainer}>
        <RichToolbar
          editor={richText}
          actions={[
            actions.setBold,
            actions.setItalic,
            actions.setUnderline,
            actions.heading1,
            actions.heading2,
            actions.insertBulletsList,
            actions.insertOrderedList,
            actions.undo,
            actions.redo,
          ]}
          iconTint={colors.textSecondary}
          selectedIconTint={colors.primary}
          style={styles.toolbar}
        />
        <TouchableOpacity 
          style={styles.toolbarSaveBtn} 
          onPress={handleSave}
          disabled={saving}
        >
          <Text style={styles.toolbarSaveText}>{saving ? "Saving" : "Save"}</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.editorContainer}>
        <RichEditor
          ref={richText}
          initialContentHTML={footerHtml}
          onChange={(html) => {
            htmlRef.current = html;
          }}
          placeholder="Enter terms and conditions, payment details, or other footer notes here..."
          editorStyle={{
            backgroundColor: colors.surface,
            color: colors.text,
            placeholderColor: colors.textSecondary,
          }}
          style={{ flex: 1 }}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { 
    flex: 1, 
    backgroundColor: colors.background 
  },
  toolbarContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  toolbar: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  toolbarSaveBtn: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    justifyContent: 'center',
  },
  toolbarSaveText: {
    color: colors.primary,
    fontWeight: 'bold',
    fontSize: 16,
  },
  editorContainer: {
    flex: 1,
  }
});
