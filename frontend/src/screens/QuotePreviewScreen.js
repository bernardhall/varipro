import React, { useState, useEffect } from 'react';
import { View, StyleSheet, TouchableOpacity, Text, Alert, ActivityIndicator, Linking } from 'react-native';
import { WebView } from 'react-native-webview';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import * as MailComposer from 'expo-mail-composer';
import * as SMS from 'expo-sms';
import { useAuth } from '../hooks/useAuth';
import { getAccountSettings, getClient, updateQuote, BASE_URL } from '../services/api';
import { colors, spacing, radius } from '../utils/theme';

export default function QuotePreviewScreen({ route, navigation }) {
  const { quote } = route.params;
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [htmlContent, setHtmlContent] = useState('');
  
  useEffect(() => {
    generateHtml();
  }, []);

  const generateHtml = async () => {
    try {
      setLoading(true);
      const settings = await getAccountSettings();
      let client = null;
      if (quote.client_id) {
        client = await getClient(quote.client_id);
      }

      const fmt = (n) => `$${(n || 0).toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

      // Construct Tables
      let laborRows = quote.tasks?.map(t => {
        let cost = t.task_type === 'set' ? t.price : (t.estimated_hours * t.hourly_rate);
        let desc = t.task_name + (t.task_type === 'hourly' ? ` (${t.estimated_hours} hrs @ ${fmt(t.hourly_rate)}/hr)` : '');
        return `<tr><td>${desc}</td><td class="text-right">${fmt(cost)}</td></tr>`;
      }).join('') || '';

      let materialsRows = quote.materials?.map(m => `<tr><td>${m.item_name} (${m.quantity} @ ${fmt(m.unit_cost)})</td><td class="text-right">${fmt(m.total)}</td></tr>`).join('') || '';
      let equipmentRows = quote.equipment?.map(e => `<tr><td>${e.item_name} (${e.duration_days} days @ ${fmt(e.daily_rate)}/d)</td><td class="text-right">${fmt(e.total)}</td></tr>`).join('') || '';
      let sundryRows = quote.sundry?.map(s => `<tr><td>${s.description}</td><td class="text-right">${fmt(s.flat_amount)}</td></tr>`).join('') || '';
      let higherCostRows = quote.higher_costs?.map(h => `<tr><td>${h.description}</td><td class="text-right">${fmt(h.amount)}</td></tr>`).join('') || '';

      let allRows = '';
      if (laborRows) allRows += `<tr class="section-row"><td colspan="2"><strong>Labour / Tasks</strong></td></tr>${laborRows}`;
      if (materialsRows) allRows += `<tr class="section-row"><td colspan="2"><strong>Materials</strong></td></tr>${materialsRows}`;
      if (equipmentRows) allRows += `<tr class="section-row"><td colspan="2"><strong>Equipment</strong></td></tr>${equipmentRows}`;
      if (sundryRows) allRows += `<tr class="section-row"><td colspan="2"><strong>Sundry</strong></td></tr>${sundryRows}`;
      if (higherCostRows) allRows += `<tr class="section-row"><td colspan="2"><strong>Higher Costs / Permits</strong></td></tr>${higherCostRows}`;

      // Photos
      let photosHtml = '';
      if (quote.photos && quote.photos.length > 0) {
        photosHtml = `
          <div class="photos-section" style="page-break-before: always;">
            <h2>Site Photos</h2>
            <div class="photo-grid">
              ${quote.photos.map(p => `
                <div class="photo-card">
                  <img src="${BASE_URL}${p.image_uri}" alt="Site Photo" />
                  ${p.caption ? `<p>${p.caption}</p>` : ''}
                </div>
              `).join('')}
            </div>
          </div>
        `;
      }

      const html = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, minimum-scale=1.0, user-scalable=no" />
          <style>
            @page { margin: 20mm; }
            body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; color: #333; line-height: 1.5; font-size: 14px; margin: 0; padding: 0; }
            .header { display: flex; justify-content: space-between; border-bottom: 2px solid ${colors.primary}; padding-bottom: 20px; margin-bottom: 30px; }
            .logo { max-width: 200px; max-height: 100px; }
            .business-info { text-align: right; }
            .business-info h1 { margin: 0; color: ${colors.primary}; font-size: 24px; }
            .business-info p { margin: 2px 0; color: #666; font-size: 12px; }
            
            .quote-meta { display: flex; justify-content: space-between; margin-bottom: 30px; }
            .client-info h3 { margin: 0 0 10px 0; color: ${colors.primary}; }
            .client-info p { margin: 2px 0; }
            
            .quote-details { text-align: right; }
            .quote-details h2 { margin: 0 0 5px 0; font-size: 28px; color: #333; }
            
            .summary { background: #f9f9f9; padding: 15px; border-radius: 5px; margin-bottom: 30px; }
            
            table { width: 100%; border-collapse: collapse; margin-bottom: 30px; }
            th { text-align: left; padding: 10px; border-bottom: 2px solid #ddd; color: #666; }
            td { padding: 10px; border-bottom: 1px solid #eee; }
            .text-right { text-align: right; }
            .section-row td { background: #fdfdfd; color: ${colors.primary}; padding-top: 15px; padding-bottom: 5px; border-bottom: none; }
            
            .totals { width: 40%; float: right; margin-bottom: 50px; }
            .totals table { margin-bottom: 0; }
            .totals td { padding: 8px 10px; }
            .grand-total { font-size: 20px; font-weight: bold; color: ${colors.primary}; border-top: 2px solid ${colors.primary}; }
            
            .clearfix::after { content: ""; clear: both; display: table; }
            
            .footer-notes { clear: both; border-top: 1px solid #ddd; padding-top: 20px; font-size: 12px; color: #666; }
            
            .photos-section h2 { color: ${colors.primary}; border-bottom: 1px solid #ddd; padding-bottom: 10px; }
            .photo-grid { display: flex; flex-wrap: wrap; gap: 20px; margin-top: 20px; }
            .photo-card { width: calc(50% - 10px); break-inside: avoid; margin-bottom: 20px; }
            .photo-card img { width: 100%; height: auto; border-radius: 5px; border: 1px solid #eee; }
            .photo-card p { font-size: 12px; color: #555; text-align: center; margin-top: 5px; }
          </style>
        </head>
        <body>
          <div class="header">
            <div>
              ${settings.logo_uri ? `<img src="${BASE_URL}${settings.logo_uri}" class="logo" />` : ''}
            </div>
            <div class="business-info">
              <h1>${settings.business_name || 'Quote'}</h1>
              ${settings.tax_reg_number ? `<p>Tax Reg: ${settings.tax_reg_number}</p>` : ''}
              ${settings.address ? `<p>${settings.address}</p>` : ''}
              ${settings.email ? `<p>${settings.email}</p>` : ''}
              ${settings.phone ? `<p>${settings.phone}</p>` : ''}
              ${settings.web_page ? `<p>${settings.web_page}</p>` : ''}
            </div>
          </div>

          <div class="quote-meta">
            <div class="client-info">
              <h3>Quote For:</h3>
              <p><strong>${client?.full_name || quote.client_name || 'N/A'}</strong></p>
              ${client?.site_address ? `<p>${client.site_address}</p>` : ''}
              ${client?.email ? `<p>${client.email}</p>` : ''}
              ${client?.phone ? `<p>${client.phone}</p>` : ''}
            </div>
            <div class="quote-details">
              <h2>QUOTE</h2>
              <p><strong>Job:</strong> ${quote.job_name}</p>
              <p><strong>Date:</strong> ${new Date(quote.updated_at).toLocaleDateString('en-AU')}</p>
            </div>
          </div>

          ${quote.summary_explanation ? `
            <div class="summary">
              <strong>Work Summary:</strong><br/>
              ${quote.summary_explanation.replace(/\\n/g, '<br/>')}
            </div>
          ` : ''}

          <table>
            <thead>
              <tr>
                <th>Description</th>
                <th class="text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              ${allRows}
            </tbody>
          </table>

          <div class="totals clearfix">
            <table>
              <tr>
                <td>Subtotal:</td>
                <td class="text-right">${fmt(quote.grand_total - quote.tax_amount)}</td>
              </tr>
              <tr>
                <td>Tax:</td>
                <td class="text-right">${fmt(quote.tax_amount)}</td>
              </tr>
              <tr class="grand-total">
                <td>Total:</td>
                <td class="text-right">${fmt(quote.grand_total)}</td>
              </tr>
            </table>
          </div>

          ${photosHtml}

          ${settings.quote_footer ? `
            <div class="footer-notes">
              ${settings.quote_footer}
            </div>
          ` : ''}
        </body>
        </html>
      `;

      setHtmlContent(html);
    } catch (err) {
      Alert.alert('Error', err.message);
    } finally {
      setLoading(false);
    }
  };

  const handlePrint = async () => {
    try {
      await Print.printAsync({
        html: htmlContent,
      });
    } catch (err) {
      Alert.alert('Error', err.message);
    }
  };

  const handleEmail = async () => {
    try {
      // Set status to 'sent' on the backend so the client can view it publicly
      try {
        await updateQuote(quote.id, { status: 'sent' });
      } catch (statusErr) {
        console.warn('Could not update status to sent:', statusErr);
      }

      const { uri } = await Print.printToFileAsync({ html: htmlContent });
      const portalLink = `https://myvaripro.com/quote.html?id=${quote.id}`;

      const emailHtml = `
        <div style="font-family: sans-serif; font-size: 15px; color: #333; line-height: 1.6;">
          <p>Hi ${quote.client_name || 'there'},</p>
          <p>Please find attached the quote for <strong>${quote.job_name}</strong>.</p>
          <p>You can also review the quote, add comments, and approve or decline it online by clicking the button below:</p>
          <br/>
          <a href="${portalLink}" style="background-color: #ff5722; color: white; padding: 14px 28px; text-decoration: none; font-weight: bold; border-radius: 8px; display: inline-block;">🔍 Review & Approve Quote</a>
          <br/><br/>
          <p>Thanks,<br/>${user?.first_name || 'Your Provider'}</p>
        </div>
      `;

      await MailComposer.composeAsync({
        subject: `Quote: ${quote.job_name}`,
        body: emailHtml,
        isHtml: true,
        attachments: [uri],
      });
    } catch (err) {
      Alert.alert('Error', err.message);
    }
  };

  const handleSMS = async () => {
    try {
      // Set status to 'sent' on the backend so the client can view it publicly
      try {
        await updateQuote(quote.id, { status: 'sent' });
      } catch (statusErr) {
        console.warn('Could not update status to sent:', statusErr);
      }

      const { uri } = await Print.printToFileAsync({ html: htmlContent });
      const isAvailable = await SMS.isAvailableAsync();
      const portalLink = `https://myvaripro.com/quote.html?id=${quote.id}`;
      
      if (isAvailable) {
        await SMS.sendSMSAsync(
          [],
          `Hi ${quote.client_name || ''}, here is the quote for ${quote.job_name}. Review the attached PDF or view online here: ${portalLink}`,
          { attachments: { uri, mimeType: 'application/pdf', filename: `Quote_${quote.job_name.replace(/ /g, '_')}.pdf` } }
        );
      } else {
        Alert.alert('Error', 'SMS is not available on this device');
      }
    } catch (err) {
      Alert.alert('Error', err.message);
    }
  };

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={{ marginTop: 10, color: colors.textSecondary }}>Generating Preview...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.actionRow}>
        <TouchableOpacity style={styles.btnSecondary} onPress={handlePrint}>
          <Text style={styles.btnSecondaryText}>🖨️ Print</Text>
        </TouchableOpacity>
        <TouchableOpacity style={{ ...styles.btnPrimary, backgroundColor: '#007AFF' }} onPress={handleSMS}>
          <Text style={styles.btnPrimaryText}>💬 SMS</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.btnPrimary} onPress={handleEmail}>
          <Text style={styles.btnPrimaryText}>📧 Email Quote</Text>
        </TouchableOpacity>
      </View>
      <View style={styles.webviewContainer}>
        <WebView 
          source={{ html: htmlContent }} 
          style={{ flex: 1 }}
          originWhitelist={['*']}
          scalesPageToFit={true}
          showsVerticalScrollIndicator={false}
          onShouldStartLoadWithRequest={(request) => {
            if (request.url.startsWith('mailto:')) {
              Linking.openURL(request.url);
              return false;
            }
            return true;
          }}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#eee',
  },
  actionRow: {
    flexDirection: 'row',
    padding: spacing.md,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    justifyContent: 'flex-end',
    gap: spacing.sm,
  },
  btnSecondary: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: radius.md,
    backgroundColor: '#f0f0f0',
    borderWidth: 1,
    borderColor: '#ddd',
  },
  btnSecondaryText: {
    fontWeight: '600',
    color: '#333',
  },
  btnPrimary: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: radius.md,
    backgroundColor: colors.primary,
  },
  btnPrimaryText: {
    fontWeight: '600',
    color: '#fff',
  },
  webviewContainer: {
    flex: 1,
    margin: spacing.md,
    borderRadius: radius.md,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
    backgroundColor: '#fff',
  }
});
