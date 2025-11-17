import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';

interface CommitmentVisualizerProps {
  commitment: string;
  amount?: string;
  blinding?: string;
  rangeProof?: boolean;
  onVerify?: () => void;
  isVerified?: boolean;
}

export const CommitmentVisualizer: React.FC<CommitmentVisualizerProps> = ({
  commitment,
  amount,
  blinding,
  rangeProof = false,
  onVerify,
  isVerified = false,
}) => {
  const [expanded, setExpanded] = React.useState(false);
  const [verifying, setVerifying] = React.useState(false);

  const handleVerify = async () => {
    if (!onVerify) return;
    setVerifying(true);
    await onVerify();
    setVerifying(false);
  };

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={['#0f172a', '#1e293b', '#334155']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.card}
      >
        {/* Header */}
        <TouchableOpacity
          style={styles.header}
          onPress={() => setExpanded(!expanded)}
          activeOpacity={0.7}
        >
          <View style={styles.headerLeft}>
            <View style={styles.iconWrapper}>
              <Ionicons name="lock-closed" size={24} color="#8b5cf6" />
            </View>
            <View style={styles.headerText}>
              <Text style={styles.title}>Pedersen Commitment</Text>
              <Text style={styles.subtitle}>
                {amount ? `Amount: ${amount}` : 'Amount hidden'}
              </Text>
            </View>
          </View>
          <Ionicons
            name={expanded ? 'chevron-up' : 'chevron-down'}
            size={24}
            color="#94a3b8"
          />
        </TouchableOpacity>

        {/* Commitment Hash */}
        <View style={styles.commitmentBox}>
          <Text style={styles.commitmentLabel}>Commitment</Text>
          <Text style={styles.commitmentHash} numberOfLines={expanded ? undefined : 2}>
            {commitment}
          </Text>
        </View>

        {/* Expanded Details */}
        {expanded && (
          <View style={styles.details}>
            {/* Mathematical Formula */}
            <View style={styles.formulaBox}>
              <Text style={styles.formulaLabel}>Commitment Formula</Text>
              <Text style={styles.formula}>C = rG + vH</Text>
              <Text style={styles.formulaDesc}>
                r = blinding factor • G = generator point
              </Text>
              <Text style={styles.formulaDesc}>
                v = value (amount) • H = auxiliary generator
              </Text>
            </View>

            {/* Blinding Factor */}
            {blinding && (
              <View style={styles.dataBox}>
                <View style={styles.dataHeader}>
                  <Ionicons name="key" size={18} color="#f59e0b" />
                  <Text style={styles.dataLabel}>Blinding Factor</Text>
                </View>
                <Text style={styles.dataValue} numberOfLines={2}>
                  {blinding}
                </Text>
              </View>
            )}

            {/* Range Proof */}
            {rangeProof && (
              <View style={styles.proofBox}>
                <View style={styles.proofHeader}>
                  <Ionicons name="analytics" size={20} color="#06b6d4" />
                  <Text style={styles.proofLabel}>Range Proof Attached</Text>
                  {isVerified && (
                    <View style={styles.verifiedBadge}>
                      <Ionicons name="checkmark-circle" size={16} color="#10b981" />
                      <Text style={styles.verifiedText}>Verified</Text>
                    </View>
                  )}
                </View>
                <Text style={styles.proofDesc}>
                  Proves value is in valid range [0, 2^64) without revealing amount
                </Text>
                
                {onVerify && !isVerified && (
                  <TouchableOpacity
                    style={styles.verifyButton}
                    onPress={handleVerify}
                    disabled={verifying}
                  >
                    <Ionicons
                      name={verifying ? 'hourglass' : 'shield-checkmark'}
                      size={18}
                      color="#ffffff"
                    />
                    <Text style={styles.verifyButtonText}>
                      {verifying ? 'Verifying...' : 'Verify Proof'}
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
            )}

            {/* Properties */}
            <View style={styles.properties}>
              <Text style={styles.propertiesTitle}>Properties</Text>
              <PropertyItem
                icon="eye-off"
                label="Hiding"
                description="Value is cryptographically hidden"
                active
              />
              <PropertyItem
                icon="shield-checkmark"
                label="Binding"
                description="Cannot change without detection"
                active
              />
              <PropertyItem
                icon="git-network"
                label="Homomorphic"
                description="Supports addition without decryption"
                active
              />
            </View>
          </View>
        )}

        {/* Status Bar */}
        <View style={styles.statusBar}>
          <View style={styles.statusLeft}>
            <View style={[styles.statusDot, isVerified && styles.statusDotActive]} />
            <Text style={styles.statusText}>
              {isVerified ? 'Proof verified' : 'Not verified'}
            </Text>
          </View>
          {rangeProof && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>Range Proof</Text>
            </View>
          )}
        </View>
      </LinearGradient>
    </View>
  );
};

interface PropertyItemProps {
  icon: string;
  label: string;
  description: string;
  active: boolean;
}

const PropertyItem: React.FC<PropertyItemProps> = ({
  icon,
  label,
  description,
  active,
}) => (
  <View style={styles.propertyItem}>
    <Ionicons name={icon as any} size={20} color={active ? '#8b5cf6' : '#6b7280'} />
    <View style={styles.propertyContent}>
      <Text style={[styles.propertyLabel, !active && styles.propertyLabelInactive]}>
        {label}
      </Text>
      <Text style={[styles.propertyDesc, !active && styles.propertyDescInactive]}>
        {description}
      </Text>
    </View>
    <Ionicons
      name={active ? 'checkmark-circle' : 'close-circle'}
      size={20}
      color={active ? '#10b981' : '#6b7280'}
    />
  </View>
);

const styles = StyleSheet.create({
  container: {
    margin: 16,
  },
  card: {
    borderRadius: 16,
    padding: 20,
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  iconWrapper: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(139, 92, 246, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  headerText: {
    flex: 1,
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#f1f5f9',
    marginBottom: 2,
  },
  subtitle: {
    fontSize: 13,
    color: '#94a3b8',
  },
  commitmentBox: {
    backgroundColor: 'rgba(139, 92, 246, 0.1)',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(139, 92, 246, 0.2)',
  },
  commitmentLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#8b5cf6',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  commitmentHash: {
    fontSize: 13,
    fontFamily: 'monospace',
    color: '#e5e7eb',
    lineHeight: 20,
  },
  details: {
    marginTop: 16,
  },
  formulaBox: {
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderLeftWidth: 3,
    borderLeftColor: '#8b5cf6',
  },
  formulaLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#cbd5e1',
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  formula: {
    fontSize: 24,
    fontWeight: 'bold',
    fontFamily: 'monospace',
    color: '#ffffff',
    marginBottom: 12,
  },
  formulaDesc: {
    fontSize: 12,
    fontFamily: 'monospace',
    color: '#94a3b8',
    lineHeight: 18,
  },
  dataBox: {
    backgroundColor: 'rgba(245, 158, 11, 0.1)',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.2)',
  },
  dataHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  dataLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#f59e0b',
    marginLeft: 8,
  },
  dataValue: {
    fontSize: 12,
    fontFamily: 'monospace',
    color: '#e5e7eb',
    lineHeight: 18,
  },
  proofBox: {
    backgroundColor: 'rgba(6, 182, 212, 0.1)',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(6, 182, 212, 0.2)',
  },
  proofHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  proofLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: '#06b6d4',
    marginLeft: 8,
    flex: 1,
  },
  verifiedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(16, 185, 129, 0.2)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  verifiedText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#10b981',
    marginLeft: 4,
  },
  proofDesc: {
    fontSize: 13,
    color: '#cbd5e1',
    lineHeight: 18,
    marginBottom: 12,
  },
  verifyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#06b6d4',
    paddingVertical: 12,
    borderRadius: 8,
    gap: 8,
  },
  verifyButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#ffffff',
  },
  properties: {
    marginTop: 8,
  },
  propertiesTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#cbd5e1',
    marginBottom: 12,
  },
  propertyItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.2)',
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
  },
  propertyContent: {
    flex: 1,
    marginLeft: 12,
  },
  propertyLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#f1f5f9',
    marginBottom: 2,
  },
  propertyLabelInactive: {
    color: '#94a3b8',
  },
  propertyDesc: {
    fontSize: 12,
    color: '#cbd5e1',
  },
  propertyDescInactive: {
    color: '#64748b',
  },
  statusBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: 'rgba(148, 163, 184, 0.1)',
  },
  statusLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#6b7280',
    marginRight: 8,
  },
  statusDotActive: {
    backgroundColor: '#10b981',
  },
  statusText: {
    fontSize: 13,
    color: '#94a3b8',
  },
  badge: {
    backgroundColor: 'rgba(139, 92, 246, 0.2)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#8b5cf6',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
});
