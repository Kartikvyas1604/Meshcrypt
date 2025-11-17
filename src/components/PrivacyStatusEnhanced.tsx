import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Animated,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';

interface PrivacyMetrics {
  anonymitySet: number;
  proofVerifications: number;
  stealthAddresses: number;
  confidentialTx: number;
}

interface PrivacyStatusProps {
  isPrivacyEnabled: boolean;
  onTogglePrivacy: () => void;
  metrics?: PrivacyMetrics;
}

export const PrivacyStatus: React.FC<PrivacyStatusProps> = ({
  isPrivacyEnabled,
  onTogglePrivacy,
  metrics,
}) => {
  const [refreshing, setRefreshing] = useState(false);
  const [pulseAnim] = useState(new Animated.Value(1));

  useEffect(() => {
    if (isPrivacyEnabled) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.2,
            duration: 1000,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 1000,
            useNativeDriver: true,
          }),
        ])
      ).start();
    }
  }, [isPrivacyEnabled]);

  const onRefresh = async () => {
    setRefreshing(true);
    // Simulate metrics refresh
    await new Promise(resolve => setTimeout(resolve, 1000));
    setRefreshing(false);
  };

  return (
    <ScrollView
      style={styles.container}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
      }
    >
      {/* Privacy Toggle Card */}
      <BlurView intensity={80} style={styles.card}>
        <LinearGradient
          colors={isPrivacyEnabled ? ['#4c1d95', '#7c3aed', '#a78bfa'] : ['#374151', '#4b5563', '#6b7280']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.gradient}
        >
          <View style={styles.toggleHeader}>
            <Animated.View style={{ transform: [{ scale: pulseAnim }] }}>
              <Ionicons
                name={isPrivacyEnabled ? 'shield-checkmark' : 'shield-outline'}
                size={48}
                color={isPrivacyEnabled ? '#86efac' : '#9ca3af'}
              />
            </Animated.View>
            <View style={styles.toggleInfo}>
              <Text style={styles.toggleTitle}>Privacy Mode</Text>
              <Text style={styles.toggleSubtitle}>
                {isPrivacyEnabled ? 'All transactions are private' : 'Standard mode'}
              </Text>
            </View>
          </View>

          <TouchableOpacity
            style={[styles.toggleButton, isPrivacyEnabled && styles.toggleButtonActive]}
            onPress={onTogglePrivacy}
          >
            <Text style={styles.toggleButtonText}>
              {isPrivacyEnabled ? 'Enabled' : 'Disabled'}
            </Text>
            <Ionicons
              name={isPrivacyEnabled ? 'checkmark-circle' : 'close-circle'}
              size={24}
              color={isPrivacyEnabled ? '#10b981' : '#ef4444'}
            />
          </TouchableOpacity>
        </LinearGradient>
      </BlurView>

      {/* Privacy Metrics */}
      {metrics && (
        <View style={styles.metricsContainer}>
          <Text style={styles.sectionTitle}>Privacy Metrics</Text>
          
          <View style={styles.metricsGrid}>
            <MetricCard
              icon="people-outline"
              label="Anonymity Set"
              value={metrics.anonymitySet.toLocaleString()}
              color="#8b5cf6"
            />
            <MetricCard
              icon="checkmark-done-outline"
              label="Proofs Verified"
              value={metrics.proofVerifications.toLocaleString()}
              color="#06b6d4"
            />
            <MetricCard
              icon="eye-off-outline"
              label="Stealth Addresses"
              value={metrics.stealthAddresses.toLocaleString()}
              color="#10b981"
            />
            <MetricCard
              icon="lock-closed-outline"
              label="Confidential TX"
              value={metrics.confidentialTx.toLocaleString()}
              color="#f59e0b"
            />
          </View>
        </View>
      )}

      {/* Privacy Features */}
      <View style={styles.featuresContainer}>
        <Text style={styles.sectionTitle}>Active Features</Text>
        
        <FeatureItem
          icon="fingerprint"
          title="Stealth Addresses"
          description="One-time addresses for each transaction"
          enabled={isPrivacyEnabled}
        />
        <FeatureItem
          icon="eye-off"
          title="Confidential Amounts"
          description="Transaction values hidden via commitments"
          enabled={isPrivacyEnabled}
        />
        <FeatureItem
          icon="analytics"
          title="Range Proofs"
          description="Prove amounts without revealing values"
          enabled={isPrivacyEnabled}
        />
        <FeatureItem
          icon="git-network"
          title="Ring Signatures"
          description="Transaction anonymity via mixing"
          enabled={isPrivacyEnabled}
        />
        <FeatureItem
          icon="shield-checkmark"
          title="Zero-Knowledge Proofs"
          description="Verify without revealing data"
          enabled={isPrivacyEnabled}
        />
      </View>

      {/* Privacy Status Indicator */}
      <View style={styles.statusBar}>
        <View style={[styles.statusDot, isPrivacyEnabled && styles.statusDotActive]} />
        <Text style={styles.statusText}>
          {isPrivacyEnabled
            ? 'All transactions are fully private and anonymous'
            : 'Privacy features are currently disabled'}
        </Text>
      </View>
    </ScrollView>
  );
};

interface MetricCardProps {
  icon: string;
  label: string;
  value: string;
  color: string;
}

const MetricCard: React.FC<MetricCardProps> = ({ icon, label, value, color }) => (
  <View style={[styles.metricCard, { borderLeftColor: color }]}>
    <Ionicons name={icon as any} size={32} color={color} />
    <Text style={styles.metricValue}>{value}</Text>
    <Text style={styles.metricLabel}>{label}</Text>
  </View>
);

interface FeatureItemProps {
  icon: string;
  title: string;
  description: string;
  enabled: boolean;
}

const FeatureItem: React.FC<FeatureItemProps> = ({ icon, title, description, enabled }) => (
  <View style={[styles.featureItem, !enabled && styles.featureItemDisabled]}>
    <View style={[styles.featureIcon, !enabled && styles.featureIconDisabled]}>
      <Ionicons name={icon as any} size={24} color={enabled ? '#8b5cf6' : '#6b7280'} />
    </View>
    <View style={styles.featureContent}>
      <Text style={[styles.featureTitle, !enabled && styles.featureTitleDisabled]}>
        {title}
      </Text>
      <Text style={[styles.featureDescription, !enabled && styles.featureDescriptionDisabled]}>
        {description}
      </Text>
    </View>
    <Ionicons
      name={enabled ? 'checkmark-circle' : 'close-circle'}
      size={24}
      color={enabled ? '#10b981' : '#ef4444'}
    />
  </View>
);

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f172a',
  },
  card: {
    margin: 16,
    borderRadius: 16,
    overflow: 'hidden',
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  gradient: {
    padding: 20,
  },
  toggleHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
  },
  toggleInfo: {
    marginLeft: 16,
    flex: 1,
  },
  toggleTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#ffffff',
    marginBottom: 4,
  },
  toggleSubtitle: {
    fontSize: 14,
    color: '#e5e7eb',
    opacity: 0.8,
  },
  toggleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  toggleButtonActive: {
    backgroundColor: 'rgba(16, 185, 129, 0.2)',
    borderColor: '#10b981',
  },
  toggleButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#ffffff',
    marginRight: 8,
  },
  metricsContainer: {
    margin: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#f1f5f9',
    marginBottom: 16,
    paddingLeft: 4,
  },
  metricsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  metricCard: {
    width: '48%',
    backgroundColor: '#1e293b',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderLeftWidth: 4,
    elevation: 4,
  },
  metricValue: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#ffffff',
    marginVertical: 8,
  },
  metricLabel: {
    fontSize: 12,
    color: '#94a3b8',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  featuresContainer: {
    margin: 16,
  },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1e293b',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  featureItemDisabled: {
    opacity: 0.6,
  },
  featureIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(139, 92, 246, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
  },
  featureIconDisabled: {
    backgroundColor: 'rgba(107, 114, 128, 0.2)',
  },
  featureContent: {
    flex: 1,
  },
  featureTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#f1f5f9',
    marginBottom: 4,
  },
  featureTitleDisabled: {
    color: '#94a3b8',
  },
  featureDescription: {
    fontSize: 13,
    color: '#cbd5e1',
  },
  featureDescriptionDisabled: {
    color: '#64748b',
  },
  statusBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1e293b',
    padding: 16,
    margin: 16,
    borderRadius: 12,
  },
  statusDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#ef4444',
    marginRight: 12,
  },
  statusDotActive: {
    backgroundColor: '#10b981',
  },
  statusText: {
    flex: 1,
    fontSize: 14,
    color: '#cbd5e1',
  },
});
