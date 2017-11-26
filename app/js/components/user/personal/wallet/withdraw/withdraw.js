helperbitControllers.controller('MeWalletWithdrawCtrl', ['config', '$scope', '$rootScope', '$uibModalInstance', 'modalData', '$bitcoin', '$api',
	function (config, $scope, $rootScope, $uibModalInstance, modalData, $bitcoin, $api) {
		$scope.withdrawal = { fee: 0.0, value: 0.1, mnemonic: '', destination: '', step: 0, loading: false, error: '' };
		$scope.mtype = 'withdraw';

		$scope.cancel = function () {
			$uibModalInstance.dismiss('cancel');
		};

		$scope.close = function (txid) {
			$uibModalInstance.close(txid);
		};

		$scope.withdraw = function () {
			$scope.withdrawal = {
				step: 0,
				loading: false,
				mnemonic: '',
				error: { error: '', data: {} },
				description: '',
				value: config.minDonation,
				fee: 0.0,
				destination: ''
			};

			if ($scope.fixedDestination)
				$scope.withdrawal.destination = $scope.fixedDestination;

			if ($scope.fixedValue)
				$scope.withdrawal.value = parseFloat($scope.fixedValue);

			if ($scope.fixedDescription)
				$scope.withdrawal.description = $scope.fixedDescription;

			$api.wallet.getTransactions($scope.wallet.address).then(function (res) {
				$scope.wallet.txs = res.data.txs;
			});

			$api.wallet.multisig.getTransactions().then(function (res) {
				$scope.wallet.pendingtxs = res.data.txs;
			});

			if ($scope.mtype == 'eventdonation') {
				$api.wallet.withdrawDistributionFees($scope.wallet.address, $scope.distribution, $scope.withdrawal.value)
					.then(function (res) {
						$scope.withdrawal.fee = parseFloat(res.data.fastest) / 100000000;
						$scope.withdrawal.feeprofile = 'fastest';
						$scope.fees = {
							fastest: parseFloat(res.data.fastest) / 100000000,
							halfhour: parseFloat(res.data.halfhour) / 100000000,
							hour: parseFloat(res.data.hour) / 100000000,
							slowest: parseFloat(res.data.hour) / 1.3 / 100000000
						};
					});
			}
		};


		$api.wallet.get(modalData.address).then(function (res) {
			$scope.wallet = res.data;

			$api.wallet.balance(modalData.address).then(function (res) {
				$scope.balance = res.data;
			});

			/* TODO: Check for destinations */

			if ('destination' in modalData)
				$scope.fixedDestination = modalData.destination;

			if ('mtype' in modalData)
				$scope.mtype = modalData.mtype;

			if ('value' in modalData)
				$scope.fixedValue = modalData.value;

			if ('description' in modalData)
				$scope.fixedDescription = modalData.description;

			if ('distribution' in modalData) {
				$scope.distribution = modalData.distribution;
				$scope.distributionn = Object.keys($scope.distribution).length;
			}

			if ('event' in modalData)
				$scope.event = modalData.event;


			$scope.withdraw();
		});


		$scope.eventDonate = function () {
			var keys = $bitcoin.mnemonicToKeys($scope.withdrawal.mnemonic);

			if ($.inArray(keys.public, $scope.wallet.pubkeys) == -1) {
				$scope.withdrawal.error = { error: 'XIM' };
				$scope.withdrawal.loading = false;
				return;
			}

			$scope.withdrawal.loading = true;
			$scope.withdrawal.value = parseFloat($scope.withdrawal.value);

			var donreq = {
				address: $scope.wallet.address,
				value: $scope.withdrawal.value,
				users: $scope.distribution,
				fee: $scope.withdrawal.fee,
				event: $scope.event
			};

			$api.donation.create(donreq).then(function (res) {
				var txhex = $bitcoin.sign(res.data.txhex, {
					segwit: $scope.wallet.segwit,
					seed: $scope.withdrawal.mnemonic,
					utxos: res.data.utxos,
					pubkeys: $scope.wallet.pubkeys
				});

				$api.wallet.sendDonation($scope.wallet.address, res.data.donation, txhex)
					.then(function (res) {
						$scope.withdrawal.step = 2;
						$scope.withdrawal.txid = res.data.txid;
						$scope.withdrawal.loading = false;
					})
					.catch(function (res) {
						$scope.withdrawal.error = res.data;
						$scope.withdrawal.loading = false;
						$scope.withdrawal.step = 0;
					});
			})
			.catch(function (res) {
				$scope.withdrawal.error = res.data;
				$scope.withdrawal.loading = false;
				$scope.withdrawal.step = 0;
			});
		};

		$scope.withdrawFeeDo = function () {
			if (!$bitcoin.checkAddress($scope.withdrawal.destination)) {
				$scope.withdrawal.error = { error: 'EW2' };
				return;
			}

			$scope.withdrawal.loading = true;
			$scope.withdrawal.value = parseFloat($scope.withdrawal.value);

			var wreq = {
				value: $scope.withdrawal.value,
				destination: $scope.withdrawal.destination
			};

			/* Check the mnemonic (for single/company wallets) */
			if (!$scope.wallet.ismultisig) {
				var keys = $bitcoin.mnemonicToKeys($scope.withdrawal.mnemonic);

				if ($.inArray(keys.public, $scope.wallet.pubkeys) == -1) {
					$scope.withdrawal.error = { error: 'XIM' };
					$scope.withdrawal.loading = false;
					return;
				}
			}

			/* Get the fees for this withdraw */
			$api.wallet.withdrawFees($scope.wallet.address, $scope.withdrawal.destination, $scope.withdrawal.value)
				.then(function (res) {
					$scope.withdrawal.fee = parseFloat(res.data.fastest) / 100000000;
					$scope.withdrawal.feeprofile = 'fastest';
					$scope.withdrawal.error = null;
					$scope.withdrawal.loading = false;
					$scope.withdrawal.step = 1;
					$scope.fees = {
						fastest: parseFloat(res.data.fastest) / 100000000,
						halfhour: parseFloat(res.data.halfhour) / 100000000,
						hour: parseFloat(res.data.hour) / 100000000,
						slowest: parseFloat(res.data.hour) / 1.3 / 100000000
					};

					$scope.withdrawal.vvalue = $scope.withdrawal.value;
					if (($scope.withdrawal.vvalue + $scope.withdrawal.fee) > $scope.balance.balance + $scope.balance.unconfirmed)
						$scope.withdrawal.vvalue = $scope.balance.balance + $scope.balance.unconfirmed - $scope.withdrawal.fee;
				}).catch(function (res) {
					$scope.withdrawal.error = res.data;
					$scope.withdrawal.loading = false;
				});
		};

		$scope.changedFeeProfile = function () {
			$scope.withdrawal.fee = $scope.fees[$scope.withdrawal.feeprofile];

			if ($scope.mtype != 'eventdonation') {
				$scope.withdrawal.vvalue = $scope.withdrawal.value;
				if (($scope.withdrawal.vvalue + $scope.withdrawal.fee) > $scope.balance.balance + $scope.balance.unconfirmed)
					$scope.withdrawal.vvalue = $scope.balance.balance + $scope.balance.unconfirmed - $scope.withdrawal.fee;
			}
		};

		$scope.withdrawMultisigDo = function () {
			$scope.withdrawal.loading = true;

			var wreq = {
				fee: $scope.withdrawal.fee,
				value: $scope.withdrawal.vvalue,
				destination: $scope.withdrawal.destination,
				description: $scope.withdrawal.description
			};

			if ('ror' in modalData)
				wreq['ror'] = modalData.ror;


			$api.wallet.withdraw($scope.wallet.address, wreq).then(function (res) {
				$scope.withdrawal.loading = false;
				$scope.withdrawal.step = 2;
				$scope.withdrawal.loading = false;
				$rootScope.$emit('notificationUpdate', { from: 'wallet' });
			}).catch(function (res) {
				$scope.withdrawal.error = res.data;
				$scope.withdrawal.step = 0;
				$scope.withdrawal.loading = false;
			});
		};

		$scope.withdrawGoBack = function () {
			$scope.withdrawal.step -= 1;
		};

		$scope.withdrawDo = function (w) {
			$scope.withdrawal.loading = true;

			var keys = $bitcoin.mnemonicToKeys($scope.withdrawal.mnemonic);

			if ($.inArray(keys.public, $scope.wallet.pubkeys) == -1) {
				$scope.withdrawal.error = { error: 'XIM' };
				$scope.withdrawal.loading = false;
				return;
			}

			var wreq = {
				fee: $scope.withdrawal.fee,
				value: $scope.withdrawal.vvalue,
				destination: $scope.withdrawal.destination
			};

			$api.wallet.withdraw($scope.wallet.address, wreq).then(function (res) {
				$scope.withdrawal.loading = false;

				var txhex = $bitcoin.sign(res.data.txhex, {
					segwit: $scope.wallet.segwit,
					seed: $scope.withdrawal.mnemonic,
					utxos: res.data.utxos,
					pubkeys: $scope.wallet.pubkeys
				});

				$api.wallet.send($scope.wallet.address, txhex).then(function (res) {
					$scope.withdrawal.step = 2;
					$scope.withdrawal.txid = res.data.txid;
					$scope.withdrawal.loading = false;
				}).catch(function (res) {
					$scope.withdrawal.step = 0;
					$scope.withdrawal.error = res.data;
					$scope.withdrawal.loading = false;
				});
			}).catch(function (res) {
				$scope.withdrawal.step = 0;
				$scope.withdrawal.error = res.data;
				$scope.withdrawal.loading = false;
			});
		};

		$scope.removeMultisigTransaction = function (txid) {
			$api.wallet.multisig.delete(txid).then(function (res) {
				$scope.cancel();
			});
		};

	}
]);
