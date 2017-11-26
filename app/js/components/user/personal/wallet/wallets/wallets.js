/* User profile /me/wallet */
helperbitControllers.controller ('MeWalletCtrl', ['$scope', '$location', '$cookies', '$routeParams', '$timeout', '$rootScope', '$uibModal', '$api', '$bitcoin',
	function ($scope, $location, $cookies, $routeParams, $timeout, $rootScope, $uibModal, $api, $bitcoin) {
		if (! $cookies.get ('token')) { $location.path ('/login'); }

		$scope.rnd = ('' + Math.random ()).replace ('.', '');
		$scope.username = $cookies.get ('username');
		$scope.email = $cookies.get ('email');
		$scope.loading = true;
		$scope.wallets = [];
		$scope.adminof = [];
		$scope.faucet = { loading: false, error: '' };
		$scope.settings = { error: '' };
		$scope.remove = { loading: false };
		$scope.receiveaddress = '';
		$scope.tosign = { txs: [], phase: 0, tx: null, error: '', withmn: true };
		$scope.backup = { txid: '', loading: false, file: null, data: null, password: '', destination: '', error: '' };
		$scope.qr = '';
		
		$scope.reloadWallet = function () {
			$rootScope.$emit ('reloadWallets', {});
		};

		$scope.withdraw = function (w) {
			var modalI = $uibModal.open({
				templateUrl: 'js/components/user/personal/wallet/withdraw/withdraw.html',
				controller: 'MeWalletWithdrawCtrl',
				resolve: { modalData: function () { return {
					address: w.address
				}; } }
			});

			modalI.result.then(function () {
				$scope.reloadWallet ();
			}, function () {
				$scope.reloadWallet ();
			});
		};
		
		
		$scope.$on('loadedWallets', function(event, data) {
			$scope.wallets = data.wallets;
			$scope.adminof = data.adminof;
		});

		$api.me.get ().then (function (res) {
			$scope.user = res.data;
		});


		$scope.reloadWallet ();
		/* Update the receiveaddress */
		$scope.receive = function (w) {
			$scope.receiveaddress = w;
			$api.wallet.updateReceive (w).then (function (res) { });
		};

		$scope.faucet = function (w) {
			$scope.faucet.loading = true;
			$api.wallet.faucet (w.address).then (function (res) {
				$scope.faucet.loading = false;
				$scope.reloadWallet ();
				$('#depositModal').modal('hide');
				$('#faucetDoneModal').modal('show');
			}).catch (function (res){
				$scope.faucet.error = res.data.error;
				$scope.faucet.loading = false;
			});
		};

		$scope.remove = function (w) {
			$scope.remove.loading = true;

			$api.wallet.delete (w.address).then (function (res) {
				$scope.remove.loading = false;
				$scope.reloadWallet ();
				$('#settingsModal').modal('hide');
			}).catch (function (res){
				$scope.settings.error = res.data.error;
				$scope.remove.loading = false;
			});
		};

		$scope.update = function (w) {
			$api.wallet.updateLabel (w.address, w.label).then (function (res){
				$scope.reloadWallet ();
				$('#settingsModal').modal('hide');
			}).catch (function (res){
				$scope.settings.error = res.data.error;
			});
		};


		$scope.deposit = function (w) {
			$scope.selectedwallet = w;
			$scope.faucet.error = '';
			$scope.qr = 'bitcoin:' + w.address;

			$('#depositModal').modal('show');

			$api.wallet.getTransactions (w.address).then (function (res){
				w.txs = res.data.txs;
			});
		};


		$scope.settings = function (w) {
			$scope.remove.loading = false;
			$scope.settings.error = '';
			$scope.selectedwallet = w;
			$scope.backup = { txid: '', loading: false, file: null, data: null, password: '', destination: '', error: '' };
			$('#settingsModal').modal('show');
		};





		/* Backward compatibility feed multisig */
		if ('feed_multisig' in $routeParams) {
			$location.path('/me/wallet/feed').search({ 
				wallet: $routeParams['feed_multisig'],
				organization: $routeParams['organization'],
				label: $routeParams['label']
			});
		}



		/*********************************
		 * Multisig sign transaction
		 */
		$api.wallet.multisig.getTransactions ().then (function (res){
			var data = res.data;
			$scope.rors = {};
				
			for (var i = 0; i < data.txs.length; i++) {
				if (data.txs[i].status == 'signing' && $scope.username != data.txs[i].from && data.txs[i].signers.indexOf ($scope.email) == -1) {
					$scope.tosign.txs.push (data.txs[i]);

					if (data.txs[i].ror) {
						$api.ror.get (data.txs[i].ror, true).then (function (res) {
							$scope.rors [res.data._id] = res.data;
						});
					}
				}
			}

			if ($scope.tosign.txs.length > 0) {
				$('#signModal').modal ('show');
			}
		});
		
			
		/* Refuse to sign a transaction */
		$scope.signTxRefuse = function () {
			$api.wallet.multisig.signRefuse ($scope.tosign.tx._id).then (function (res) {
				$scope.tosign.phase = 3;
			}).catch (function (res) { });
		};


		$scope.signTxDo = function () {
			var keys;
			var upair;
			
			/* Sign with mnemonic */
			if ($scope.tosign.withmn) {
				keys = $bitcoin.mnemonicToKeys ($scope.tosign.tx.mnemonic);
			}
			/* Sign with backup file */
			else {
				$scope.backup.error = '';

				/* Errors */
				if ($scope.backup.file === null) {
					$scope.backup.error = 'XNF';
					return;
				}
				
				if ($scope.backup.data === null) {
					$scope.backup.error = 'XNJ';
					return;
				}
				
				if (! ('encprivkey' in $scope.backup.data) ||
					! ('walletid' in $scope.backup.data) ||
					! ('pubkey' in $scope.backup.data)){
					$scope.backup.error = 'XNJ';
					return;
				}

				keys = $bitcoin.decryptKeys ($scope.backup.data.encprivkey, $scope.backup.password);
				
				if (keys == null) {
					$scope.backup.error = 'XWAP';
					return;
				}
			}
			
			if ($.inArray(keys.public, $scope.tosign.tx.pubkeys) == -1) {
				$scope.tosign.error = 'XIM';
				return;
			}

			/* Request the updated tx */
			$api.wallet.multisig.getTransactions ().then (function (res) {
				var data = res.data;
				for (var i = 0; i < data.txs.length; i++) {
					if (data.txs[i].txid == $scope.tosign.tx.txid) 
						$scope.tosign.tx = data.txs[i];
				}

				/* Put the signature */
				var txhex = $bitcoin.sign ($scope.tosign.tx.hex, {
					segwit: $scope.tosign.tx.segwit,
					wif: keys.private,
					utxos: $scope.tosign.tx.utxos,
					n: $scope.tosign.tx.n,
					complete: false,
					pubkeys: $scope.tosign.tx.pubkeys
				});

				$api.wallet.multisig.sign ($scope.tosign.tx._id, txhex).then (function (res){
					$scope.tosign.phase = 2;
					$rootScope.$emit ('notificationUpdate', { from: 'wallet' });
				}).catch (function (res){
					$scope.tosign.error = 'E';
				});
			});
		};

		$scope.signTx = function (tx) {
			$scope.tosign.tx = tx;
			$scope.tosign.tx.mnemonic = '';
			$scope.tosign.phase = 1;
		};

		
		/*********************************
		 * Merchant proof
		 */				
		$scope.merchantProof = function () {
			/* Error if he is a single user */
			if ($scope.user.usertype == 'singleuser') {		
				$('#merchantProofSingleUserErrorModal').modal ('show');
				return;
			}
			
			
			var merchantproof = $routeParams['merchant_proof'];
			var price = $routeParams['price'];
			var merchant = $routeParams['merchant'];
			
			/* Convert price to BTC */
			// TODO
			
			$scope.merchantproof = {
				error: '',
				txs: [],
				tx: null,
				price: price,
				merchant: merchant,
				proof: merchantproof,
				phase: 0
			};
				
			$api.proof.recognize ($scope.merchantproof.proof, price)
			.then (function (res) {
				$scope.merchantproof.txs = res.data.txs;
				
				if ($scope.merchantproof.txs.length === 0)
					$scope.merchantproof.phase = -1;
				else
					$scope.merchantproof.tx = $scope.merchantproof.txs[0];
					
				$('#merchantProofModal').modal ('show');
			})
			.catch (function (res) {
				$scope.merchantproof.error = res.data.error;			
				$('#merchantProofModal').modal ('show');	
			});
		};
		
		$scope.merchantProofBind = function () {
			$api.proof.bind ($scope.merchantproof.tx.txid, $scope.merchantproof.proof, $scope.merchantproof.merchant)
			.then (function (res) {
				$location.path ('/transaction/' + $scope.merchantproof.tx.txid)
					.search ('finalize', '1')
					.search ('merchant_proof', null)
					.search ('price', null)
					.search ('merchant', null);
			})
			.catch (function (res) {
				$scope.merchantproof.error = res.data.error;	
			});
		};
		
		if ('merchant_proof' in $routeParams) {
			$timeout($scope.merchantProof, 1000);
		}

		
		/*********************************
		 * Backup restore
		 */		
		$scope.loadBackupFile = function (file) {
			$scope.backup.error = '';
			$scope.backup.file = file;
			
			if (file === null) {
				$scope.backup.data = null;
				return;
			}
			
			var reader = new FileReader();
			
			reader.onload = function(event) {
				var data = event.target.result;
				$scope.backup.data = JSON.parse(data);
			};
			reader.readAsText (file);
		};
		
		$scope.restoreBackup = function (wallet) {
			$scope.backup.error = '';
			/* Errors */
			if (wallet.balance === 0.0) {
				$scope.backup.error = 'XEW';
				return;	
			}
			
			if ($scope.backup.file === null) {
				$scope.backup.error = 'XNF';
				return;
			}
			
			if ($scope.backup.data === null) {
				$scope.backup.error = 'XNJ';
				return;
			}
			
			if (! ('encprivkey' in $scope.backup.data) ||
				! ('address' in $scope.backup.data) ||
				! ('pubkey' in $scope.backup.data)){
				$scope.backup.error = 'XNJ';
				return;
			}
			
			if (wallet.address != $scope.backup.data.address) {
				$scope.backup.error = 'XWA';
				return;
			}
			
			$scope.backup.loading = true;
			
			/* Decrypt the key */
			var keys = $bitcoin.decryptKeys ($scope.backup.data.encprivkey, $scope.backup.password);
			if (keys == null) {
				$scope.backup.error = 'XWP';
				return;
			}
			
			if (keys.public != $scope.backup.data.pubkey) {
				$scope.backup.error = 'XWP';
				return;
			}
			
			var wreq = {
				fee: $scope.evaluteFee (2, 1, true), 
				value: wallet.balance, 
				destination: $scope.backup.destination
			};
			
			/* Send the refund transaction */
			$api.wallet.withdraw (wallet.address, wreq).then (function (res) {
				var txhex = $bitcoin.sign (res.data.txhex, {
					segwit: wallet.segwit,
					wif: keys.private,
					utxos: $scope.tosign.tx.utxos,
					pubkeys: wallet.pubkeys
				});
				
				$api.wallet.send (wallet.address, txhex).then (function (res){
					$scope.backup.txid = res.data.txid;
					
					/* Delete the empty wallet */
					/*$http.post (config.apiUrl + '/wallet/' + wallet.address + '/update', {delete: true}).success (function (data) {
						$scope.backup.loading = false;
						$scope.reloadWallet ();
					}).error (function (data){
						$scope.backup.error = data.error;
						$scope.backup.loading = false;
					});
					*/
					$scope.backup.loading = false;
					$scope.reloadWallet ();
				});
			}).catch (function (data){
				$scope.backup.error = data.error;
				$scope.backup.loading = false;
			});	
		};
	}
]);
