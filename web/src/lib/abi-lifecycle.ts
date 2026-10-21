// Generated from contracts/out. Do not edit by hand.
export const lifecycleAbi = [
  {
    "type": "constructor",
    "inputs": [
      {
        "name": "identityRegistry",
        "type": "address",
        "internalType": "contract IERC8004Identity"
      }
    ],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "ALP_VERSION",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "string",
        "internalType": "string"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "HANDSHAKE_TYPEHASH",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "IDENTITY_REGISTRY",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "contract IERC8004Identity"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "MAX_CLOCK_SKEW",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "MAX_EPOCH_STEP",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint64",
        "internalType": "uint64"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "MAX_HANDSHAKE_TTL",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "agentCount",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "agentIds",
    "inputs": [
      {
        "name": "start",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "count",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [
      {
        "name": "ids",
        "type": "uint256[]",
        "internalType": "uint256[]"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "agentRegistry",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "string",
        "internalType": "string"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "eip712Domain",
    "inputs": [],
    "outputs": [
      {
        "name": "fields",
        "type": "bytes1",
        "internalType": "bytes1"
      },
      {
        "name": "name",
        "type": "string",
        "internalType": "string"
      },
      {
        "name": "version",
        "type": "string",
        "internalType": "string"
      },
      {
        "name": "chainId",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "verifyingContract",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "salt",
        "type": "bytes32",
        "internalType": "bytes32"
      },
      {
        "name": "extensions",
        "type": "uint256[]",
        "internalType": "uint256[]"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "flagMismatch",
    "inputs": [
      {
        "name": "agentId",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "uint64",
        "internalType": "uint64"
      }
    ],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "getOperation",
    "inputs": [
      {
        "name": "caller",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "operationId",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "tuple",
        "internalType": "struct AgentLifecycleRegistry.Operation",
        "components": [
          {
            "name": "requestHash",
            "type": "bytes32",
            "internalType": "bytes32"
          },
          {
            "name": "resultSequence",
            "type": "uint64",
            "internalType": "uint64"
          }
        ]
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "getRecord",
    "inputs": [
      {
        "name": "agentId",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "tuple",
        "internalType": "struct AgentLifecycleRegistry.Record",
        "components": [
          {
            "name": "controller",
            "type": "address",
            "internalType": "address"
          },
          {
            "name": "sequence",
            "type": "uint64",
            "internalType": "uint64"
          },
          {
            "name": "state",
            "type": "uint8",
            "internalType": "enum AgentLifecycleRegistry.State"
          },
          {
            "name": "retired",
            "type": "bool",
            "internalType": "bool"
          },
          {
            "name": "ownerSnapshot",
            "type": "address",
            "internalType": "address"
          },
          {
            "name": "authorityEpoch",
            "type": "uint64",
            "internalType": "uint64"
          },
          {
            "name": "walletSnapshot",
            "type": "address",
            "internalType": "address"
          },
          {
            "name": "updatedAtBlock",
            "type": "uint64",
            "internalType": "uint64"
          },
          {
            "name": "evidence",
            "type": "bytes32",
            "internalType": "bytes32"
          },
          {
            "name": "policyDigest",
            "type": "bytes32",
            "internalType": "bytes32"
          }
        ]
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "handshakeDigest",
    "inputs": [
      {
        "name": "agentId",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "audience",
        "type": "string",
        "internalType": "string"
      },
      {
        "name": "nonce",
        "type": "bytes32",
        "internalType": "bytes32"
      },
      {
        "name": "descriptorDigest",
        "type": "bytes32",
        "internalType": "bytes32"
      },
      {
        "name": "lifecycleSequence",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "authorityEpoch",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "issuedAt",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "expiresAt",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "liveStatus",
    "inputs": [
      {
        "name": "agentId",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [
      {
        "name": "state",
        "type": "uint8",
        "internalType": "enum AgentLifecycleRegistry.State"
      },
      {
        "name": "ownerMatches",
        "type": "bool",
        "internalType": "bool"
      },
      {
        "name": "walletMatches",
        "type": "bool",
        "internalType": "bool"
      },
      {
        "name": "operational",
        "type": "bool",
        "internalType": "bool"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "rebind",
    "inputs": [
      {
        "name": "agentId",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "expectedSequence",
        "type": "uint64",
        "internalType": "uint64"
      },
      {
        "name": "newController",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "policyDigest",
        "type": "bytes32",
        "internalType": "bytes32"
      },
      {
        "name": "evidence",
        "type": "bytes32",
        "internalType": "bytes32"
      },
      {
        "name": "operationId",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "uint64",
        "internalType": "uint64"
      }
    ],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "register",
    "inputs": [
      {
        "name": "agentId",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "controller",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "policyDigest",
        "type": "bytes32",
        "internalType": "bytes32"
      },
      {
        "name": "evidence",
        "type": "bytes32",
        "internalType": "bytes32"
      },
      {
        "name": "operationId",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "uint64",
        "internalType": "uint64"
      }
    ],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "transition",
    "inputs": [
      {
        "name": "agentId",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "expectedSequence",
        "type": "uint64",
        "internalType": "uint64"
      },
      {
        "name": "next",
        "type": "uint8",
        "internalType": "enum AgentLifecycleRegistry.State"
      },
      {
        "name": "authorityEpoch",
        "type": "uint64",
        "internalType": "uint64"
      },
      {
        "name": "policyDigest",
        "type": "bytes32",
        "internalType": "bytes32"
      },
      {
        "name": "evidence",
        "type": "bytes32",
        "internalType": "bytes32"
      },
      {
        "name": "operationId",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "uint64",
        "internalType": "uint64"
      }
    ],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "verifyHandshake",
    "inputs": [
      {
        "name": "agentId",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "audience",
        "type": "string",
        "internalType": "string"
      },
      {
        "name": "nonce",
        "type": "bytes32",
        "internalType": "bytes32"
      },
      {
        "name": "descriptorDigest",
        "type": "bytes32",
        "internalType": "bytes32"
      },
      {
        "name": "lifecycleSequence",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "authorityEpoch",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "issuedAt",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "expiresAt",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "signature",
        "type": "bytes",
        "internalType": "bytes"
      }
    ],
    "outputs": [
      {
        "name": "ok",
        "type": "bool",
        "internalType": "bool"
      },
      {
        "name": "reason",
        "type": "uint8",
        "internalType": "uint8"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "event",
    "name": "EIP712DomainChanged",
    "inputs": [],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "Rebound",
    "inputs": [
      {
        "name": "agentId",
        "type": "uint256",
        "indexed": true,
        "internalType": "uint256"
      },
      {
        "name": "sequence",
        "type": "uint64",
        "indexed": true,
        "internalType": "uint64"
      },
      {
        "name": "owner",
        "type": "address",
        "indexed": false,
        "internalType": "address"
      },
      {
        "name": "wallet",
        "type": "address",
        "indexed": false,
        "internalType": "address"
      },
      {
        "name": "controller",
        "type": "address",
        "indexed": false,
        "internalType": "address"
      },
      {
        "name": "authorityEpoch",
        "type": "uint64",
        "indexed": false,
        "internalType": "uint64"
      },
      {
        "name": "policyDigest",
        "type": "bytes32",
        "indexed": false,
        "internalType": "bytes32"
      },
      {
        "name": "evidence",
        "type": "bytes32",
        "indexed": false,
        "internalType": "bytes32"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "Transition",
    "inputs": [
      {
        "name": "agentId",
        "type": "uint256",
        "indexed": true,
        "internalType": "uint256"
      },
      {
        "name": "from",
        "type": "uint8",
        "indexed": false,
        "internalType": "enum AgentLifecycleRegistry.State"
      },
      {
        "name": "to",
        "type": "uint8",
        "indexed": false,
        "internalType": "enum AgentLifecycleRegistry.State"
      },
      {
        "name": "sequence",
        "type": "uint64",
        "indexed": true,
        "internalType": "uint64"
      },
      {
        "name": "evidence",
        "type": "bytes32",
        "indexed": false,
        "internalType": "bytes32"
      },
      {
        "name": "actor",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "controller",
        "type": "address",
        "indexed": false,
        "internalType": "address"
      },
      {
        "name": "authorityEpoch",
        "type": "uint64",
        "indexed": false,
        "internalType": "uint64"
      },
      {
        "name": "policyDigest",
        "type": "bytes32",
        "indexed": false,
        "internalType": "bytes32"
      },
      {
        "name": "operationId",
        "type": "bytes32",
        "indexed": false,
        "internalType": "bytes32"
      },
      {
        "name": "previousBlock",
        "type": "uint64",
        "indexed": false,
        "internalType": "uint64"
      },
      {
        "name": "blockNumber",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      },
      {
        "name": "timestamp",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      }
    ],
    "anonymous": false
  },
  {
    "type": "error",
    "name": "AlreadyRecorded",
    "inputs": []
  },
  {
    "type": "error",
    "name": "BindingChanged",
    "inputs": []
  },
  {
    "type": "error",
    "name": "ControllerFrozen",
    "inputs": []
  },
  {
    "type": "error",
    "name": "DedicatedWalletRequired",
    "inputs": []
  },
  {
    "type": "error",
    "name": "EpochJump",
    "inputs": [
      {
        "name": "given",
        "type": "uint64",
        "internalType": "uint64"
      },
      {
        "name": "current",
        "type": "uint64",
        "internalType": "uint64"
      }
    ]
  },
  {
    "type": "error",
    "name": "IdempotencyConflict",
    "inputs": [
      {
        "name": "operationId",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ]
  },
  {
    "type": "error",
    "name": "InvalidController",
    "inputs": []
  },
  {
    "type": "error",
    "name": "InvalidEdge",
    "inputs": [
      {
        "name": "from",
        "type": "uint8",
        "internalType": "enum AgentLifecycleRegistry.State"
      },
      {
        "name": "to",
        "type": "uint8",
        "internalType": "enum AgentLifecycleRegistry.State"
      }
    ]
  },
  {
    "type": "error",
    "name": "InvalidShortString",
    "inputs": []
  },
  {
    "type": "error",
    "name": "NotOwner",
    "inputs": []
  },
  {
    "type": "error",
    "name": "NotRecorded",
    "inputs": []
  },
  {
    "type": "error",
    "name": "NothingToFlag",
    "inputs": []
  },
  {
    "type": "error",
    "name": "PolicyMismatch",
    "inputs": []
  },
  {
    "type": "error",
    "name": "RetiredIsTerminal",
    "inputs": []
  },
  {
    "type": "error",
    "name": "StaleEpoch",
    "inputs": [
      {
        "name": "given",
        "type": "uint64",
        "internalType": "uint64"
      },
      {
        "name": "current",
        "type": "uint64",
        "internalType": "uint64"
      }
    ]
  },
  {
    "type": "error",
    "name": "StaleSequence",
    "inputs": [
      {
        "name": "expected",
        "type": "uint64",
        "internalType": "uint64"
      },
      {
        "name": "current",
        "type": "uint64",
        "internalType": "uint64"
      }
    ]
  },
  {
    "type": "error",
    "name": "StringTooLong",
    "inputs": [
      {
        "name": "str",
        "type": "string",
        "internalType": "string"
      }
    ]
  },
  {
    "type": "error",
    "name": "StringsInsufficientHexLength",
    "inputs": [
      {
        "name": "value",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "length",
        "type": "uint256",
        "internalType": "uint256"
      }
    ]
  },
  {
    "type": "error",
    "name": "Unauthorized",
    "inputs": []
  },
  {
    "type": "error",
    "name": "WalletUnset",
    "inputs": []
  },
  {
    "type": "error",
    "name": "ZeroValue",
    "inputs": []
  }
] as const;
