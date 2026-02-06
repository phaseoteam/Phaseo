# Usage

## Properties

Name | Type | Description | Notes
------------ | ------------- | ------------- | -------------
**PromptTokens** | Pointer to **int32** |  | [optional] 
**CompletionTokens** | Pointer to **int32** |  | [optional] 
**TotalTokens** | Pointer to **int32** |  | [optional] 
**PromptTokensDetails** | Pointer to [**UsageDetails**](UsageDetails.md) |  | [optional] 
**CompletionTokensDetails** | Pointer to [**UsageDetails**](UsageDetails.md) |  | [optional] 
**InputTokens** | Pointer to **int32** |  | [optional] 
**OutputTokens** | Pointer to **int32** |  | [optional] 
**InputTokensDetails** | Pointer to [**UsageDetails**](UsageDetails.md) |  | [optional] 
**OutputTokensDetails** | Pointer to [**UsageDetails**](UsageDetails.md) |  | [optional] 
**InputTextTokens** | Pointer to **int32** |  | [optional] 
**OutputTextTokens** | Pointer to **int32** |  | [optional] 
**CachedReadTextTokens** | Pointer to **int32** |  | [optional] 
**CachedWriteTextTokens** | Pointer to **int32** |  | [optional] 
**ReasoningTokens** | Pointer to **int32** |  | [optional] 
**Pricing** | Pointer to [**PricingBreakdown**](PricingBreakdown.md) |  | [optional] 
**PricingBreakdown** | Pointer to [**PricingBreakdown**](PricingBreakdown.md) |  | [optional] 

## Methods

### NewUsage

`func NewUsage() *Usage`

NewUsage instantiates a new Usage object
This constructor will assign default values to properties that have it defined,
and makes sure properties required by API are set, but the set of arguments
will change when the set of required properties is changed

### NewUsageWithDefaults

`func NewUsageWithDefaults() *Usage`

NewUsageWithDefaults instantiates a new Usage object
This constructor will only assign default values to properties that have it defined,
but it doesn't guarantee that properties required by API are set

### GetPromptTokens

`func (o *Usage) GetPromptTokens() int32`

GetPromptTokens returns the PromptTokens field if non-nil, zero value otherwise.

### GetPromptTokensOk

`func (o *Usage) GetPromptTokensOk() (*int32, bool)`

GetPromptTokensOk returns a tuple with the PromptTokens field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetPromptTokens

`func (o *Usage) SetPromptTokens(v int32)`

SetPromptTokens sets PromptTokens field to given value.

### HasPromptTokens

`func (o *Usage) HasPromptTokens() bool`

HasPromptTokens returns a boolean if a field has been set.

### GetCompletionTokens

`func (o *Usage) GetCompletionTokens() int32`

GetCompletionTokens returns the CompletionTokens field if non-nil, zero value otherwise.

### GetCompletionTokensOk

`func (o *Usage) GetCompletionTokensOk() (*int32, bool)`

GetCompletionTokensOk returns a tuple with the CompletionTokens field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetCompletionTokens

`func (o *Usage) SetCompletionTokens(v int32)`

SetCompletionTokens sets CompletionTokens field to given value.

### HasCompletionTokens

`func (o *Usage) HasCompletionTokens() bool`

HasCompletionTokens returns a boolean if a field has been set.

### GetTotalTokens

`func (o *Usage) GetTotalTokens() int32`

GetTotalTokens returns the TotalTokens field if non-nil, zero value otherwise.

### GetTotalTokensOk

`func (o *Usage) GetTotalTokensOk() (*int32, bool)`

GetTotalTokensOk returns a tuple with the TotalTokens field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetTotalTokens

`func (o *Usage) SetTotalTokens(v int32)`

SetTotalTokens sets TotalTokens field to given value.

### HasTotalTokens

`func (o *Usage) HasTotalTokens() bool`

HasTotalTokens returns a boolean if a field has been set.

### GetPromptTokensDetails

`func (o *Usage) GetPromptTokensDetails() UsageDetails`

GetPromptTokensDetails returns the PromptTokensDetails field if non-nil, zero value otherwise.

### GetPromptTokensDetailsOk

`func (o *Usage) GetPromptTokensDetailsOk() (*UsageDetails, bool)`

GetPromptTokensDetailsOk returns a tuple with the PromptTokensDetails field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetPromptTokensDetails

`func (o *Usage) SetPromptTokensDetails(v UsageDetails)`

SetPromptTokensDetails sets PromptTokensDetails field to given value.

### HasPromptTokensDetails

`func (o *Usage) HasPromptTokensDetails() bool`

HasPromptTokensDetails returns a boolean if a field has been set.

### GetCompletionTokensDetails

`func (o *Usage) GetCompletionTokensDetails() UsageDetails`

GetCompletionTokensDetails returns the CompletionTokensDetails field if non-nil, zero value otherwise.

### GetCompletionTokensDetailsOk

`func (o *Usage) GetCompletionTokensDetailsOk() (*UsageDetails, bool)`

GetCompletionTokensDetailsOk returns a tuple with the CompletionTokensDetails field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetCompletionTokensDetails

`func (o *Usage) SetCompletionTokensDetails(v UsageDetails)`

SetCompletionTokensDetails sets CompletionTokensDetails field to given value.

### HasCompletionTokensDetails

`func (o *Usage) HasCompletionTokensDetails() bool`

HasCompletionTokensDetails returns a boolean if a field has been set.

### GetInputTokens

`func (o *Usage) GetInputTokens() int32`

GetInputTokens returns the InputTokens field if non-nil, zero value otherwise.

### GetInputTokensOk

`func (o *Usage) GetInputTokensOk() (*int32, bool)`

GetInputTokensOk returns a tuple with the InputTokens field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetInputTokens

`func (o *Usage) SetInputTokens(v int32)`

SetInputTokens sets InputTokens field to given value.

### HasInputTokens

`func (o *Usage) HasInputTokens() bool`

HasInputTokens returns a boolean if a field has been set.

### GetOutputTokens

`func (o *Usage) GetOutputTokens() int32`

GetOutputTokens returns the OutputTokens field if non-nil, zero value otherwise.

### GetOutputTokensOk

`func (o *Usage) GetOutputTokensOk() (*int32, bool)`

GetOutputTokensOk returns a tuple with the OutputTokens field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetOutputTokens

`func (o *Usage) SetOutputTokens(v int32)`

SetOutputTokens sets OutputTokens field to given value.

### HasOutputTokens

`func (o *Usage) HasOutputTokens() bool`

HasOutputTokens returns a boolean if a field has been set.

### GetInputTokensDetails

`func (o *Usage) GetInputTokensDetails() UsageDetails`

GetInputTokensDetails returns the InputTokensDetails field if non-nil, zero value otherwise.

### GetInputTokensDetailsOk

`func (o *Usage) GetInputTokensDetailsOk() (*UsageDetails, bool)`

GetInputTokensDetailsOk returns a tuple with the InputTokensDetails field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetInputTokensDetails

`func (o *Usage) SetInputTokensDetails(v UsageDetails)`

SetInputTokensDetails sets InputTokensDetails field to given value.

### HasInputTokensDetails

`func (o *Usage) HasInputTokensDetails() bool`

HasInputTokensDetails returns a boolean if a field has been set.

### GetOutputTokensDetails

`func (o *Usage) GetOutputTokensDetails() UsageDetails`

GetOutputTokensDetails returns the OutputTokensDetails field if non-nil, zero value otherwise.

### GetOutputTokensDetailsOk

`func (o *Usage) GetOutputTokensDetailsOk() (*UsageDetails, bool)`

GetOutputTokensDetailsOk returns a tuple with the OutputTokensDetails field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetOutputTokensDetails

`func (o *Usage) SetOutputTokensDetails(v UsageDetails)`

SetOutputTokensDetails sets OutputTokensDetails field to given value.

### HasOutputTokensDetails

`func (o *Usage) HasOutputTokensDetails() bool`

HasOutputTokensDetails returns a boolean if a field has been set.

### GetInputTextTokens

`func (o *Usage) GetInputTextTokens() int32`

GetInputTextTokens returns the InputTextTokens field if non-nil, zero value otherwise.

### GetInputTextTokensOk

`func (o *Usage) GetInputTextTokensOk() (*int32, bool)`

GetInputTextTokensOk returns a tuple with the InputTextTokens field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetInputTextTokens

`func (o *Usage) SetInputTextTokens(v int32)`

SetInputTextTokens sets InputTextTokens field to given value.

### HasInputTextTokens

`func (o *Usage) HasInputTextTokens() bool`

HasInputTextTokens returns a boolean if a field has been set.

### GetOutputTextTokens

`func (o *Usage) GetOutputTextTokens() int32`

GetOutputTextTokens returns the OutputTextTokens field if non-nil, zero value otherwise.

### GetOutputTextTokensOk

`func (o *Usage) GetOutputTextTokensOk() (*int32, bool)`

GetOutputTextTokensOk returns a tuple with the OutputTextTokens field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetOutputTextTokens

`func (o *Usage) SetOutputTextTokens(v int32)`

SetOutputTextTokens sets OutputTextTokens field to given value.

### HasOutputTextTokens

`func (o *Usage) HasOutputTextTokens() bool`

HasOutputTextTokens returns a boolean if a field has been set.

### GetCachedReadTextTokens

`func (o *Usage) GetCachedReadTextTokens() int32`

GetCachedReadTextTokens returns the CachedReadTextTokens field if non-nil, zero value otherwise.

### GetCachedReadTextTokensOk

`func (o *Usage) GetCachedReadTextTokensOk() (*int32, bool)`

GetCachedReadTextTokensOk returns a tuple with the CachedReadTextTokens field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetCachedReadTextTokens

`func (o *Usage) SetCachedReadTextTokens(v int32)`

SetCachedReadTextTokens sets CachedReadTextTokens field to given value.

### HasCachedReadTextTokens

`func (o *Usage) HasCachedReadTextTokens() bool`

HasCachedReadTextTokens returns a boolean if a field has been set.

### GetCachedWriteTextTokens

`func (o *Usage) GetCachedWriteTextTokens() int32`

GetCachedWriteTextTokens returns the CachedWriteTextTokens field if non-nil, zero value otherwise.

### GetCachedWriteTextTokensOk

`func (o *Usage) GetCachedWriteTextTokensOk() (*int32, bool)`

GetCachedWriteTextTokensOk returns a tuple with the CachedWriteTextTokens field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetCachedWriteTextTokens

`func (o *Usage) SetCachedWriteTextTokens(v int32)`

SetCachedWriteTextTokens sets CachedWriteTextTokens field to given value.

### HasCachedWriteTextTokens

`func (o *Usage) HasCachedWriteTextTokens() bool`

HasCachedWriteTextTokens returns a boolean if a field has been set.

### GetReasoningTokens

`func (o *Usage) GetReasoningTokens() int32`

GetReasoningTokens returns the ReasoningTokens field if non-nil, zero value otherwise.

### GetReasoningTokensOk

`func (o *Usage) GetReasoningTokensOk() (*int32, bool)`

GetReasoningTokensOk returns a tuple with the ReasoningTokens field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetReasoningTokens

`func (o *Usage) SetReasoningTokens(v int32)`

SetReasoningTokens sets ReasoningTokens field to given value.

### HasReasoningTokens

`func (o *Usage) HasReasoningTokens() bool`

HasReasoningTokens returns a boolean if a field has been set.

### GetPricing

`func (o *Usage) GetPricing() PricingBreakdown`

GetPricing returns the Pricing field if non-nil, zero value otherwise.

### GetPricingOk

`func (o *Usage) GetPricingOk() (*PricingBreakdown, bool)`

GetPricingOk returns a tuple with the Pricing field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetPricing

`func (o *Usage) SetPricing(v PricingBreakdown)`

SetPricing sets Pricing field to given value.

### HasPricing

`func (o *Usage) HasPricing() bool`

HasPricing returns a boolean if a field has been set.

### GetPricingBreakdown

`func (o *Usage) GetPricingBreakdown() PricingBreakdown`

GetPricingBreakdown returns the PricingBreakdown field if non-nil, zero value otherwise.

### GetPricingBreakdownOk

`func (o *Usage) GetPricingBreakdownOk() (*PricingBreakdown, bool)`

GetPricingBreakdownOk returns a tuple with the PricingBreakdown field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetPricingBreakdown

`func (o *Usage) SetPricingBreakdown(v PricingBreakdown)`

SetPricingBreakdown sets PricingBreakdown field to given value.

### HasPricingBreakdown

`func (o *Usage) HasPricingBreakdown() bool`

HasPricingBreakdown returns a boolean if a field has been set.


[[Back to Model list]](../README.md#documentation-for-models) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to README]](../README.md)


